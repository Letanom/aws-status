// Ön yüzü jsdom içinde gerçek bir snapshot ile çalıştırır: hata vermeden çizilmeli, ana bölümler dolmalı.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";

import { runCheck } from "../netlify/lib/check.ts";
import { memoryStorage } from "../netlify/lib/store.ts";

const html = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
const js = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
const H = 3600_000;

function item(guidKey, ts, title, text) {
  return `<item><title>${title}</title><link>https://status.aws.amazon.com/</link>
<pubDate>${new Date(ts).toUTCString()}</pubDate>
<guid isPermaLink="false">https://status.aws.amazon.com/#${guidKey}_${Math.floor(ts / 1000)}</guid>
<description><![CDATA[<div><span class="yellowfg"> 1:02 AM PDT</span>&nbsp;${text}</div>]]></description></item>`;
}

async function makeSnapshot({ withIncidents }) {
  const now = Date.now();
  const feed = `<?xml version="1.0"?><rss version="2.0"><channel><title>x</title>${
    withIncidents
      ? [
          item("ec2-eu-central-1", now - 3 * H, "Service disruption: Increased Error Rates", "We are investigating increased error rates."),
          item("ec2-eu-central-1", now - 1 * H, "Service disruption: Increased Error Rates", "We have identified the root cause."),
          item("lambda-us-east-1", now - 30 * H, "Service degradation: Increased Latencies", "Investigating."),
          item("lambda-us-east-1", now - 28 * H, "Service is operating normally: [RESOLVED] Increased Latencies", "The issue has been resolved."),
          item("multipleservices-me-central-1", now - 10 * 24 * H, "Service disruption: Increased Error Rates", "EC2 and S3 resources can't be restored."),
        ].join("")
      : ""
  }</channel></rss>`;
  const fetchImpl = async (input) => {
    const url = String(input);
    if (url.includes("status.aws.amazon.com/rss")) return new Response(feed, { status: 200 });
    if (url.includes("downdetector.com")) return new Response("User reports indicate no current problems at Amazon AWS", { status: 200 });
    if (url.includes(".amazonaws.com")) return new Response("<Error/>", { status: 403 });
    return new Response("?", { status: 404 });
  };
  const storage = memoryStorage();
  process.env.PROBE_REGIONS = "us-east-1,eu-west-1,eu-central-1";
  process.env.PROBE_SERVICES = "s3,sts";
  let snap;
  for (let i = 0; i < 3; i++) snap = await runCheck({ storage, fetchImpl, now: () => now - (2 - i) * 300_000 });
  delete process.env.PROBE_REGIONS;
  delete process.env.PROBE_SERVICES;
  return snap;
}

async function openPage(snapshot, status = 200) {
  const errors = [];
  const dom = new JSDOM(html, { url: "https://example.test/?lang=tr", runScripts: "outside-only", pretendToBeVisual: true });
  const { window } = dom;
  window.addEventListener("error", (e) => errors.push(String(e.error?.stack || e.message)));
  window.fetch = async () => new Response(status === 200 ? JSON.stringify(snapshot) : "{}", { status });
  window.eval(js);
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 25));
    const title = window.document.querySelector("#verdict-title")?.textContent ?? "";
    if (title && title !== "…" && !/yükleniyor/i.test(title)) break;
  }
  return { window, doc: window.document, errors, close: () => window.close() };
}

test("ön yüz: aktif kesinti varken eksiksiz çizilir", async () => {
  const snap = await makeSnapshot({ withIncidents: true });
  assert.equal(snap.overall.level, "disruption");
  const { doc, errors, close } = await openPage(snap);
  try {
    assert.deepEqual(errors, []);
    assert.match(doc.querySelector("#verdict-title").textContent, /kesinti/i);
    assert.equal(doc.querySelector("#lamp").dataset.l, "disruption");
    assert.ok(doc.querySelectorAll("#hm-scroll table.hm tbody tr").length >= 8, "ısı haritası satırları");
    assert.ok(doc.querySelectorAll("#hm-scroll .cell[data-l='disruption']").length >= 1, "EC2/eu-central-1 hücresi kırmızı");
    assert.equal(doc.querySelectorAll("#active-list article.inc").length, 1);
    assert.equal(doc.querySelectorAll("#hist-list details.h").length, 3);
    assert.equal(doc.querySelectorAll("#uptime-bars .bar").length, 90);
    assert.equal(doc.querySelectorAll("#about-body article.src").length, 3, "üç veri kaynağı açıklaması");
    assert.match(doc.querySelector("#about-body").textContent, /5 dakika/);
    assert.ok(doc.querySelectorAll("#ptable tbody tr").length === 3, "3 sonda bölgesi");
    assert.match(doc.title, /🔴/);
    assert.ok(doc.querySelectorAll("#chips li").length === 3);
  } finally {
    close();
  }
});

test("ön yüz: sorunsuz durumda yeşil ve boş durum metni", async () => {
  const snap = await makeSnapshot({ withIncidents: false });
  assert.equal(snap.overall.level, "ok");
  const { doc, errors, close } = await openPage(snap);
  try {
    assert.deepEqual(errors, []);
    assert.equal(doc.querySelector("#lamp").dataset.l, "ok");
    assert.equal(doc.querySelectorAll("#active-list article.inc").length, 0);
    assert.ok(doc.querySelector("#active-list .empty"));
    assert.match(doc.title, /🟢/);
  } finally {
    close();
  }
});

test("ön yüz: dil değişimi, izleme listesi kapsamı ve sunucu hatası", async () => {
  const snap = await makeSnapshot({ withIncidents: true });
  const { window, doc, errors, close } = await openPage(snap);
  try {
    doc.querySelector("#btn-lang").click();
    assert.equal(doc.documentElement.lang, "en");
    assert.match(doc.querySelector("#verdict-title").textContent, /outage/i);

    // Sadece us-east-1 izlenirse eu-central-1'deki kesinti görünmemeli
    const regionBox = [...doc.querySelectorAll("#pick-regions-panel input")].find((_, i) => i === 0);
    regionBox.checked = true;
    regionBox.dispatchEvent(new window.Event("change", { bubbles: true }));
    const mine = doc.querySelector("#chk-mine");
    mine.checked = true;
    mine.dispatchEvent(new window.Event("change", { bubbles: true }));
    assert.equal(doc.querySelector("#lamp").dataset.l, "ok", "izleme listesinde sorun yok");
    assert.equal(doc.querySelectorAll("#active-list article.inc").length, 0);
    assert.deepEqual(errors, []);
  } finally {
    close();
  }

  const bad = await openPage(null, 503);
  try {
    assert.deepEqual(bad.errors, []);
    assert.match(bad.doc.querySelector("#verdict-title").textContent, /veri yok/i);
  } finally {
    bad.close();
  }
});
