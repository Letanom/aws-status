import type { DayAgg, HistoryPoint, Incident, Level, ProbeResult, Snapshot } from "./types.ts";
import { RANK } from "./types.ts";
import { getConfig, FEED_URL, DD_URL } from "./config.ts";
import { catalog } from "./catalog.ts";
import { fetchFeed, mergeIncidents, parseFeed } from "./aws.ts";
import { runProbes } from "./probes.ts";
import { fetchDownDetector, type DownDetectorResult } from "./downdetector.ts";
import { computeOverall, median } from "./status.ts";
import { emptyAlertState, planAlerts, type AlertState } from "./alerts.ts";
import { deliver } from "./notify.ts";
import type { Storage } from "./store.ts";

const STATE_KEY = "v2-state";
const SNAPSHOT_KEY = "v2-snapshot";
const HISTORY_SEC = 24 * 3600;
const SERIES_MAX = 36; // 3 saat
const DAYS_MAX = 90;

/** Kalıcı iç durum. Panelin gördüğü Snapshot bundan ayrı yazılır. */
interface Persisted {
  firstSeen: number;
  /** İlk başarılı AWS okumasından sonra true. Öncesinde mevcut olaylar için bildirim gönderilmez. */
  bootstrapped: boolean;
  incidents: Incident[];
  history: HistoryPoint[];
  days: DayAgg[];
  series: Record<string, (number | null)[]>;
  streaks: Record<string, number>;
  alert: AlertState;
}

export interface CheckDeps {
  storage: Storage;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

export function bumpDay(days: DayAgg[], t: number, level: Level): DayAgg[] {
  const d = new Date(t).toISOString().slice(0, 10);
  const out = days.map((x) => ({ ...x }));
  let e = out.find((x) => x.d === d);
  if (!e) {
    e = { d, n: 0, w: 0, x: 0, o: 0, u: 0 };
    out.push(e);
  }
  e.n++;
  if (level === "unknown") e.u++;
  else if (level === "info") e.w++;
  else if (level === "degraded") e.x++;
  else if (level === "disruption") e.o++;
  return out.sort((a, b) => a.d.localeCompare(b.d)).slice(-DAYS_MAX);
}

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 160);

export async function runCheck(deps: CheckDeps): Promise<Snapshot> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const now = deps.now ?? Date.now;
  const cfg = getConfig();
  const t = now();

  const prev = await deps.storage.get<Persisted>(STATE_KEY);

  const probesP = cfg.probeRegions.length && cfg.probeServices.length
    ? runProbes(cfg.probeRegions, cfg.probeServices, { timeoutMs: cfg.probeTimeoutMs, slowMs: cfg.slowMs, fetchImpl, now })
    : Promise.resolve([]);
  const feedP = fetchFeed(fetchImpl, 8000);
  const ddP = cfg.downdetector ? fetchDownDetector(fetchImpl, 5000) : Promise.resolve(null);
  const [feedR, probesR, ddR] = await Promise.allSettled([feedP, probesP, ddP]);

  // AWS akışı: hem indirme hem çözümleme başarılı olmalı.
  let awsError: string | null = null;
  let parsed: { items: number; incidents: Incident[] } | null = null;
  let awsMs: number | null = null;
  if (feedR.status === "fulfilled") {
    try {
      parsed = parseFeed(feedR.value.xml, t, cfg.activeHours);
      awsMs = feedR.value.ms;
    } catch (e) {
      awsError = errMsg(e);
    }
  } else awsError = errMsg(feedR.reason);
  const awsOk = parsed !== null;

  const stored = prev?.incidents ?? [];
  const incidents = mergeIncidents(stored, parsed?.incidents ?? [], t, cfg.activeHours);

  // Sondalar ve ardışık başarısızlık sayacı
  const rawProbes = probesR.status === "fulfilled" ? probesR.value : [];
  const streaks: Record<string, number> = {};
  const probes: ProbeResult[] = rawProbes.map((p) => {
    const key = `${p.service}|${p.region}`;
    const streak = p.ok ? 0 : (prev?.streaks[key] ?? 0) + 1;
    streaks[key] = streak;
    return { ...p, streak };
  });
  const failing = probes.filter((p) => !p.ok).length;
  // Bütün sondalar aynı anda başarısızsa sorun büyük olasılıkla bizim çıkış ağımızdadır: bölge uyarısı üretme.
  const allFailed = probes.length >= 4 && failing === probes.length;
  const responded = probes.filter((p) => p.ok);
  const medianMs = median(responded.map((p) => p.ms as number));

  const dd: DownDetectorResult | null = ddR.status === "fulfilled" ? ddR.value : null;
  const ddError = cfg.downdetector && ddR.status === "rejected" ? errMsg(ddR.reason) : null;

  const overall = computeOverall(incidents, probes, dd, awsOk);

  // Geçmiş, günlük özet, sonda grafiği
  const point: HistoryPoint = {
    t: Math.floor(t / 1000),
    l: overall.level === "unknown" ? -1 : RANK[overall.level],
    m: medianMs,
    a: incidents.filter((i) => i.status === "active" && i.severity !== "ok").length,
    f: failing,
  };
  const history = [...(prev?.history ?? []), point].filter((p) => p.t >= point.t - HISTORY_SEC);
  const days = bumpDay(prev?.days ?? [], t, overall.level);
  const series: Record<string, (number | null)[]> = {};
  for (const region of cfg.probeRegions) {
    const ms = responded.filter((p) => p.region === region).map((p) => p.ms as number);
    series[region] = [...(prev?.series[region] ?? []), median(ms)].slice(-SERIES_MAX);
  }

  // Bildirimler
  const bootstrap = !(prev?.bootstrapped ?? false);
  const plan = planAlerts({
    incidents,
    probes: allFailed ? [] : probes,
    prev: prev?.alert ?? emptyAlertState(),
    bootstrap,
    cfg,
  });
  let alertState = plan.next;
  if (plan.messages.length) {
    try {
      const r = await deliver(plan.messages, cfg, fetchImpl);
      // Hiçbir kanala ulaşılamadıysa durumu ilerletme: bir sonraki kontrol yeniden dener.
      if (r.failed > 0 && r.sent === 0) alertState = prev?.alert ?? emptyAlertState();
    } catch (e) {
      console.error("bildirim hatası:", errMsg(e));
      alertState = prev?.alert ?? emptyAlertState();
    }
  }

  const firstSeen = prev?.firstSeen ?? t;
  const snapshot: Snapshot = {
    v: 2,
    updatedAt: t,
    overall,
    sources: {
      aws: { ok: awsOk, ms: awsMs, items: parsed?.items ?? 0, error: awsError },
      downdetector: { enabled: cfg.downdetector, ok: dd !== null, state: dd ? dd.state : null, ms: dd ? dd.ms : null, error: ddError },
      probes: { total: probes.length, failed: failing, slow: probes.filter((p) => p.slow).length, ms: medianMs },
    },
    incidents,
    probes,
    probeSeries: series,
    history,
    days,
    catalog: catalog(),
    meta: {
      intervalMin: cfg.intervalMin,
      uiRefreshSec: cfg.uiRefreshSec,
      activeHours: cfg.activeHours,
      firstSeen,
      feedUrl: FEED_URL,
      ddUrl: DD_URL,
      probeRegions: cfg.probeRegions,
      probeServices: cfg.probeServices,
      probeTimeoutMs: cfg.probeTimeoutMs,
    },
  };

  const next: Persisted = {
    firstSeen,
    bootstrapped: (prev?.bootstrapped ?? false) || awsOk,
    incidents,
    history,
    days,
    series,
    streaks,
    alert: alertState,
  };
  await deps.storage.set(STATE_KEY, next);
  await deps.storage.set(SNAPSHOT_KEY, snapshot);
  return snapshot;
}

export async function readSnapshot(storage: Storage): Promise<Snapshot | null> {
  const s = await storage.get<Snapshot>(SNAPSHOT_KEY);
  return s && s.v === 2 ? s : null;
}
