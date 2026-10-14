import { REGION_NAMES, SERVICE_NAMES } from "./catalog.ts";
import type { Config } from "./config.ts";
import type { Msg } from "./notify.ts";
import { passesWatch } from "./status.ts";
import { RANK, type Incident, type ProbeResult, type Severity } from "./types.ts";

export interface AlertState {
  inc: Record<string, { ts: number; sev: Severity; resolved: boolean }>;
  probe: Record<string, boolean>;
}

export const emptyAlertState = (): AlertState => ({ inc: {}, probe: {} });

const L = {
  tr: {
    disruption: "AWS kesintisi",
    degraded: "AWS performans sorunu",
    info: "AWS bilgilendirmesi",
    escalated: "Durum kötüleşti",
    resolved: "Çözüldü",
    probeDown: "Sonda yanıt vermiyor",
    probeUp: "Sonda toparlandı",
    multi: "Birden fazla servis",
    probeBody: (list: string) => `${list} uç noktaları art arda iki kontrolde yanıt vermedi.`,
    probeUpBody: (list: string) => `${list} uç noktaları yeniden yanıt veriyor.`,
  },
  en: {
    disruption: "AWS outage",
    degraded: "AWS performance issue",
    info: "AWS notice",
    escalated: "Situation worsened",
    resolved: "Resolved",
    probeDown: "Probe not responding",
    probeUp: "Probe recovered",
    multi: "Multiple services",
    probeBody: (list: string) => `${list} endpoints failed two checks in a row.`,
    probeUpBody: (list: string) => `${list} endpoints are responding again.`,
  },
} as const;

const ICON: Record<Severity, string> = { ok: "🟢", info: "🔵", degraded: "🟠", disruption: "🔴" };

function where(inc: Incident, lang: "tr" | "en"): string {
  const names = inc.services.length ? inc.services.map((s) => SERVICE_NAMES[s] ?? s).join(", ") : L[lang].multi;
  const rn = REGION_NAMES[inc.region];
  return `${names} – ${rn ? `${inc.region} (${rn})` : inc.region}`;
}

function excerpt(inc: Incident): string {
  const last = inc.updates[inc.updates.length - 1];
  const t = (last?.text || inc.title).replace(/\s+/g, " ").trim();
  return t.length > 320 ? `${t.slice(0, 317)}…` : t;
}

const prioFor = (s: Severity): Msg["priority"] => (s === "disruption" ? 5 : s === "degraded" ? 4 : 2);

/**
 * Hangi uyarıların gönderileceğini belirler (saf fonksiyon).
 * - İlk çalıştırmada (bootstrap) mevcut durum sadece kaydedilir, uyarı gönderilmez.
 * - Her olay için yalnızca: ilk görülme, kötüleşme ve çözülme uyarı üretir.
 */
export function planAlerts(args: {
  incidents: Incident[];
  probes: ProbeResult[];
  prev: AlertState;
  bootstrap: boolean;
  cfg: Config;
}): { messages: Msg[]; next: AlertState } {
  const { incidents, probes, prev, bootstrap, cfg } = args;
  const lang = cfg.alertLang;
  const t = L[lang];
  const minRank = cfg.alertInfo ? 1 : 2;
  const messages: Msg[] = [];
  const next: AlertState = { inc: {}, probe: { ...prev.probe } };
  const known = new Set(incidents.map((i) => i.id));

  for (const i of incidents) {
    const before = prev.inc[i.id];
    if (before) next.inc[i.id] = { ...before };
    const watched = passesWatch(i, cfg.watchRegions, cfg.watchServices);

    if (i.status === "active") {
      if (!before) {
        if (bootstrap) {
          next.inc[i.id] = { ts: i.lastTs, sev: i.severity, resolved: false };
        } else if (watched && RANK[i.severity] >= minRank) {
          next.inc[i.id] = { ts: i.lastTs, sev: i.severity, resolved: false };
          messages.push({
            title: `${ICON[i.severity]} ${t[i.severity === "ok" ? "info" : i.severity]}: ${where(i, lang)}`,
            body: excerpt(i),
            priority: prioFor(i.severity),
            tags: [i.severity === "disruption" ? "rotating_light" : "warning"],
            kind: "alert",
          });
        }
      } else if (!before.resolved && RANK[i.severity] > RANK[before.sev] && watched) {
        next.inc[i.id] = { ts: i.lastTs, sev: i.severity, resolved: false };
        messages.push({
          title: `${ICON[i.severity]} ${t.escalated}: ${where(i, lang)}`,
          body: excerpt(i),
          priority: prioFor(i.severity),
          tags: ["chart_with_upwards_trend"],
          kind: "alert",
        });
      }
    } else if (before && !before.resolved) {
      next.inc[i.id].resolved = true;
      if (i.status === "resolved" && watched && !bootstrap) {
        messages.push({
          title: `🟢 ${t.resolved}: ${where(i, lang)}`,
          body: excerpt(i),
          priority: 3,
          tags: ["white_check_mark"],
          kind: "resolved",
        });
      }
    }
  }
  for (const id of Object.keys(next.inc)) if (!known.has(id)) delete next.inc[id];

  // Sondalar: bölge başına tek mesaj
  const newlyDown = new Map<string, string[]>();
  const recovered = new Map<string, string[]>();
  for (const p of probes) {
    const key = `${p.service}|${p.region}`;
    const flagged = !!prev.probe[key];
    if (p.streak >= 2 && !flagged) {
      next.probe[key] = true;
      if (!bootstrap) newlyDown.set(p.region, [...(newlyDown.get(p.region) ?? []), p.service]);
    } else if (p.streak === 0 && flagged) {
      delete next.probe[key];
      if (!bootstrap) recovered.set(p.region, [...(recovered.get(p.region) ?? []), p.service]);
    }
  }
  const probeWatched = (region: string) => cfg.watchRegions.length === 0 || cfg.watchRegions.includes(region);
  for (const [region, svcs] of newlyDown) {
    if (!probeWatched(region)) continue;
    messages.push({
      title: `🟠 ${t.probeDown}: ${region}`,
      body: t.probeBody(svcs.join(", ")),
      priority: 4,
      tags: ["warning"],
      kind: "alert",
    });
  }
  for (const [region, svcs] of recovered) {
    if (!probeWatched(region)) continue;
    messages.push({
      title: `🟢 ${t.probeUp}: ${region}`,
      body: t.probeUpBody(svcs.join(", ")),
      priority: 3,
      tags: ["white_check_mark"],
      kind: "resolved",
    });
  }

  return { messages, next };
}
