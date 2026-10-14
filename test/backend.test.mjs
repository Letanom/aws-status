// Çalıştırma: npm test   (Node >= 22.6 gerekir; .ts dosyalarını doğrudan içe aktarır)
import test from "node:test";
import assert from "node:assert/strict";

import { classify, parseFeed, mergeIncidents } from "../netlify/lib/aws.ts";
import { computeOverall, median } from "../netlify/lib/status.ts";
import { interpretDownDetector } from "../netlify/lib/downdetector.ts";
import { planAlerts, emptyAlertState } from "../netlify/lib/alerts.ts";
import { getConfig } from "../netlify/lib/config.ts";
import { runCheck } from "../netlify/lib/check.ts";
import { memoryStorage } from "../netlify/lib/store.ts";

const NOW = Date.UTC(2026, 9, 13, 8, 0, 0); // 13 Ekim 2026 08:00 UTC
const H = 3600_000;

function item(service, region, ts, title, text) {
  const d = new Date(ts).toUTCString().replace("GMT", "PDT");
  return `<item>
  <title>${title}</title>
  <link>https://status.aws.amazon.com/</link>
  <pubDate>${d}</pubDate>
  <guid isPermaLink="false">https://status.aws.amazon.com/#${service}-${region}_${Math.floor(ts / 1000)}</guid>
  <description><![CDATA[<div><span class="yellowfg"> 1:02 AM PDT</span>&nbsp;${text}</div>]]></description>
</item>`;
}

function rss(...items) {
  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel>
<title>Amazon Web Services Service Status</title><link>https://status.aws.amazon.com/</link>
<ttl>5</ttl>${items.join("\n")}</channel></rss>`;
}

const FEED = rss(
  item("ec2", "eu-central-1", NOW - 3 * H, "Service disruption: Increased Error Rates", "We are investigating increased error rates for EC2 API calls."),
  item("ec2", "eu-central-1", NOW - 1 * H, "Service disruption: Increased Error Rates", "We have identified the root cause and are working on recovery."),
  item("lambda", "us-east-1", NOW - 30 * H, "Service degradation: Increased Latencies", "We are investigating increased invoke latencies."),
  item("lambda", "us-east-1", NOW - 28 * H, "Service is operating normally: [RESOLVED] Increased Latencies", "The issue has been resolved and the service is operating normally."),
  item("multipleservices", "me-central-1", NOW - 10 * 24 * H, "Service disruption: Increased Error Rates", "Resources for EC2 and S3 in this region can't be restored."),
);

test("classify: başlık ve metinden şiddet ve çözüm", () => {
  assert.deepEqual(classify("Service disruption: X", "investigating"), { severity: "disruption", resolved: false });
  assert.deepEqual(classify("Service degradation: X", "investigating"), { severity: "degraded", resolved: false });
  assert.deepEqual(classify("Informational message: X", "maintenance"), { severity: "info", resolved: false });
  assert.equal(classify("Service is operating normally: [RESOLVED] X", "ok").resolved, true);
  assert.equal(classify("Service degradation: X", "The issue has been resolved.").resolved, true);
  assert.equal(classify("Service impact: X", "resources can't be restored").severity, "disruption");
  assert.equal(classify("Service impact: X", "resources can't be restored").resolved, false);
});

test("parseFeed: gerçek guid biçimi, gruplama, durumlar", () => {
  const { items, incidents } = parseFeed(FEED, NOW, 48);
  assert.equal(items, 5);
  assert.equal(incidents.length, 3);

  const ec2 = incidents.find((i) => i.service === "ec2");
  assert.equal(ec2.region, "eu-central-1");
  assert.equal(ec2.updates.length, 2); // iki güncelleme tek olay
  assert.equal(ec2.status, "active");
  assert.equal(ec2.severity, "disruption");
  assert.deepEqual(ec2.services, ["ec2"]);
  assert.equal(ec2.firstTs, NOW - 3 * H);

  const lambda = incidents.find((i) => i.service === "lambda");
  assert.equal(lambda.status, "resolved");
  assert.equal(lambda.severity, "ok");
  assert.equal(lambda.peak, "degraded");
  assert.equal(lambda.resolvedTs, NOW - 28 * H);

  const old = incidents.find((i) => i.service === "multipleservices");
  assert.equal(old.region, "me-central-1");
  assert.equal(old.status, "stale"); // 48 saatten eski ve kapanmamış
  assert.deepEqual(old.services.sort(), ["ec2", "s3"]);
});

test("parseFeed: RSS olmayan yanıtı reddeder", () => {
  assert.throws(() => parseFeed("<html>hata</html>", NOW, 48));
});

test("parseFeed: boş feed geçerlidir", () => {
  assert.deepEqual(parseFeed(rss(), NOW, 48).incidents, []);
});

test("mergeIncidents: feed kısalsa da geçmiş korunur, eski aktif olay 'stale' olur", () => {
  const { incidents } = parseFeed(FEED, NOW, 48);
  const later = NOW + 72 * H;
  const merged = mergeIncidents(incidents, [], later, 48);
  assert.equal(merged.find((i) => i.service === "ec2").status, "stale");
  assert.equal(merged.find((i) => i.service === "lambda").status, "resolved");
});

test("computeOverall: AWS olayı, sondalar ve DownDetector çapraz kontrolü", () => {
  const { incidents } = parseFeed(FEED, NOW, 48);
  const okProbe = (region, service = "s3") => ({ service, region, ok: true, ms: 100, status: 200, slow: false, streak: 0, ts: NOW });
  const badProbe = (region, service = "s3", streak = 2) => ({ service, region, ok: false, ms: null, status: null, slow: false, streak, ts: NOW });

  assert.equal(computeOverall(incidents, [okProbe("us-east-1")], null, true).level, "disruption");
  assert.equal(computeOverall([], [okProbe("us-east-1")], null, true).level, "ok");

  // tek bölgede iki ardışık başarısızlık: degraded
  const some = [badProbe("eu-west-1"), okProbe("us-east-1"), okProbe("us-west-2"), okProbe("eu-central-1")];
  assert.equal(computeOverall([], some, null, true).level, "degraded");
  // tek başarısızlık gürültüdür
  assert.equal(computeOverall([], [badProbe("eu-west-1", "s3", 1), okProbe("us-east-1")], null, true).level, "ok");
  // hepsi aynı anda başarısız: kendi ağımızdan şüphelen, sadece info
  const all = ["a", "b", "c", "d"].map((r) => badProbe(r));
  assert.equal(computeOverall([], all, null, true).level, "info");

  // DownDetector tek başına en fazla info
  const dd = { ok: true, state: "problem", ms: 10 };
  const r = computeOverall([], [okProbe("us-east-1")], dd, true);
  assert.equal(r.level, "info");
  assert.equal(r.reasons[0].code, "downdetector_unconfirmed");
  assert.equal(computeOverall(incidents, [], dd, true).reasons.some((x) => x.code === "downdetector_confirms"), true);

  // AWS feed çöktü ve başka sinyal yok: yeşil gösterme
  assert.equal(computeOverall([], [okProbe("us-east-1")], null, false).level, "unknown");
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([]), null);
});

test("interpretDownDetector", () => {
  assert.equal(interpretDownDetector("User reports indicate no current problems at Amazon AWS"), "ok");
  assert.equal(interpretDownDetector("User reports indicate possible problems at Amazon AWS"), "possible");
  assert.equal(interpretDownDetector("User reports indicate problems at Amazon AWS"), "problem");
  assert.equal(interpretDownDetector("<title>Just a moment...</title>"), "unknown");
});

test("planAlerts: bootstrap sessiz; yeni, kötüleşme ve çözülme için tek uyarı", () => {
  const cfg = { ...getConfig(), alertLang: "tr", watchRegions: [], watchServices: [], alertInfo: false };
  const { incidents } = parseFeed(FEED, NOW, 48);

  const boot = planAlerts({ incidents, probes: [], prev: emptyAlertState(), bootstrap: true, cfg });
  assert.equal(boot.messages.length, 0);
  assert.ok(boot.next.inc[incidents.find((i) => i.service === "ec2").id]);

  // ilk kez görülen aktif olay
  const fresh = planAlerts({ incidents, probes: [], prev: emptyAlertState(), bootstrap: false, cfg });
  assert.equal(fresh.messages.length, 1);
  assert.match(fresh.messages[0].title, /AWS kesintisi: EC2/);
  assert.equal(fresh.messages[0].priority, 5);

  // aynı durumda tekrar uyarı yok
  const again = planAlerts({ incidents, probes: [], prev: fresh.next, bootstrap: false, cfg });
  assert.equal(again.messages.length, 0);

  // çözülünce tek uyarı
  const resolvedFeed = rss(
    item("ec2", "eu-central-1", NOW - 3 * H, "Service disruption: Increased Error Rates", "investigating"),
    item("ec2", "eu-central-1", NOW - 0.5 * H, "Service is operating normally: [RESOLVED] Increased Error Rates", "The issue has been resolved."),
  );
  const res = planAlerts({ incidents: parseFeed(resolvedFeed, NOW, 48).incidents, probes: [], prev: fresh.next, bootstrap: false, cfg });
  assert.equal(res.messages.length, 1);
  assert.match(res.messages[0].title, /Çözüldü/);

  // izleme listesi dışındaki bölge için uyarı yok
  const watched = planAlerts({ incidents, probes: [], prev: emptyAlertState(), bootstrap: false, cfg: { ...cfg, watchRegions: ["us-east-1"] } });
  assert.equal(watched.messages.length, 0);
});

test("planAlerts: sonda uyarısı bölge başına tek mesaj, toparlanınca bir mesaj", () => {
  const cfg = { ...getConfig(), alertLang: "en", watchRegions: [], watchServices: [] };
  const down = (service) => ({ service, region: "eu-west-1", ok: false, ms: null, status: null, slow: false, streak: 2, ts: NOW });
  const up = (service) => ({ service, region: "eu-west-1", ok: true, ms: 90, status: 200, slow: false, streak: 0, ts: NOW });

  const a = planAlerts({ incidents: [], probes: [down("s3"), down("sts")], prev: emptyAlertState(), bootstrap: false, cfg });
  assert.equal(a.messages.length, 1);
  assert.match(a.messages[0].title, /Probe not responding: eu-west-1/);
  const b = planAlerts({ incidents: [], probes: [up("s3"), up("sts")], prev: a.next, bootstrap: false, cfg });
  assert.equal(b.messages.length, 1);
  assert.match(b.messages[0].title, /recovered/);
});

function mockFetch(state) {
  const calls = [];
  const f = async (input, init) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.includes("status.aws.amazon.com/rss")) {
      if (state.feedDown) throw new Error("ağ hatası");
      return new Response(state.feed, { status: 200 });
    }
    if (url.includes("downdetector.com")) {
      return new Response("User reports indicate no current problems at Amazon AWS", { status: 200 });
    }
    if (url.includes("hooks.example.test")) return new Response("ok", { status: 200 });
    if (url.includes(".amazonaws.com")) {
      if (state.failRegion && url.includes(state.failRegion)) return new Response("err", { status: 503 });
      return new Response("<Error/>", { status: 403 });
    }
    return new Response("?", { status: 404 });
  };
  return { f, calls };
}

test("runCheck: uçtan uca (bootstrap, kötüleşme uyarısı, geçmiş, günlük özet)", async () => {
  process.env.WEBHOOK_URL = "https://hooks.example.test/x";
  process.env.PROBE_REGIONS = "us-east-1,eu-west-1";
  process.env.PROBE_SERVICES = "s3,sts";
  const storage = memoryStorage();
  const state = { feed: rss(), feedDown: false, failRegion: null };
  const { f, calls } = mockFetch(state);
  let now = NOW;

  // 1) ilk tur: temiz, bootstrap
  let snap = await runCheck({ storage, fetchImpl: f, now: () => now });
  assert.equal(snap.overall.level, "ok");
  assert.equal(snap.sources.aws.ok, true);
  assert.equal(snap.sources.probes.total, 4);
  assert.equal(snap.sources.probes.failed, 0);
  assert.equal(snap.sources.downdetector.state, "ok");
  assert.equal(snap.history.length, 1);
  assert.equal(snap.days.length, 1);
  assert.equal(snap.days[0].n, 1);
  assert.equal(snap.meta.firstSeen, NOW);
  assert.ok(snap.catalog.coreRegions.includes("eu-central-1"));
  assert.equal(calls.filter((c) => c.url.includes("hooks.example.test")).length, 0);

  // 2) AWS yeni bir kesinti bildirir -> uyarı gider
  now += 5 * 60_000;
  state.feed = rss(item("ec2", "eu-central-1", now - 10 * 60_000, "Service disruption: Increased Error Rates", "We are investigating."));
  snap = await runCheck({ storage, fetchImpl: f, now: () => now });
  assert.equal(snap.overall.level, "disruption");
  assert.equal(snap.history.length, 2);
  assert.equal(calls.filter((c) => c.url.includes("hooks.example.test")).length, 1);
  const hook = JSON.parse(calls.find((c) => c.url.includes("hooks.example.test")).init.body);
  assert.match(hook.title, /AWS kesintisi/);

  // 3) aynı durum: ikinci uyarı gitmez
  now += 5 * 60_000;
  snap = await runCheck({ storage, fetchImpl: f, now: () => now });
  assert.equal(calls.filter((c) => c.url.includes("hooks.example.test")).length, 1);
  assert.equal(snap.days[0].o, 2);

  // 4) sonda hatası: iki ardışık turda degraded
  now += 5 * 60_000;
  state.feed = rss();
  state.failRegion = "eu-west-1";
  snap = await runCheck({ storage, fetchImpl: f, now: () => now });
  assert.notEqual(snap.overall.level, "degraded"); // olay "stale/active" olabilir ama sonda henüz streak=1
  now += 5 * 60_000;
  snap = await runCheck({ storage, fetchImpl: f, now: () => now });
  assert.ok(snap.probes.some((p) => p.region === "eu-west-1" && p.streak >= 2));
  assert.ok(["degraded", "disruption"].includes(snap.overall.level));

  // 5) AWS feed çökerse eski olaylar korunur, hata görünür
  now += 5 * 60_000;
  state.failRegion = null;
  state.feedDown = true;
  snap = await runCheck({ storage, fetchImpl: f, now: () => now });
  assert.equal(snap.sources.aws.ok, false);
  assert.ok(snap.sources.aws.error);
  assert.ok(snap.incidents.length >= 1);
  assert.ok(snap.overall.reasons.some((r) => r.code === "feed_error"));

  delete process.env.WEBHOOK_URL;
  delete process.env.PROBE_REGIONS;
  delete process.env.PROBE_SERVICES;
});
