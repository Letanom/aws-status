import { RANK, type Incident, type Level, type ProbeResult, type Reason, type Severity } from "./types.ts";
import type { DownDetectorResult } from "./downdetector.ts";

const BY_RANK: Severity[] = ["ok", "info", "degraded", "disruption"];

export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return Math.round(s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2);
}

export function passesWatch(
  inc: Pick<Incident, "region" | "services">,
  watchRegions: string[],
  watchServices: string[],
): boolean {
  const rOk = watchRegions.length === 0 || inc.region === "global" || watchRegions.includes(inc.region);
  const sOk = watchServices.length === 0 || inc.services.length === 0 || inc.services.some((s) => watchServices.includes(s));
  return rOk && sOk;
}

/**
 * Genel durum: AWS'nin resmi bildirimi, canlı sondalar ve topluluk sinyali çapraz kontrol edilir.
 * - AWS aktif olay bildirdiyse seviye olayın şiddetidir.
 * - Sondalar ardışık iki kontrolde başarısızsa en az "degraded" olur.
 *   Bütün sondalar aynı anda başarısızsa bizim çıkış ağımızdan şüphelenilir ve sadece "info" olur.
 * - DownDetector tek başına en fazla "info" üretir.
 */
export function computeOverall(
  incidents: Incident[],
  probes: ProbeResult[],
  dd: DownDetectorResult | null,
  awsOk: boolean,
): { level: Level; reasons: Reason[] } {
  const reasons: Reason[] = [];
  let rank = 0;

  const active = incidents.filter((i) => i.status === "active");
  let incidentRank = 0;
  for (const i of active) {
    const r = RANK[i.severity];
    incidentRank = Math.max(incidentRank, r);
    if (r >= 1) {
      reasons.push({ code: "incident", incidentId: i.id, region: i.region, service: i.services[0] ?? i.service });
    }
  }
  rank = Math.max(rank, incidentRank);

  const failing = probes.filter((p) => p.streak >= 2);
  if (failing.length) {
    const allFailing = probes.length >= 4 && failing.length === probes.length;
    rank = Math.max(rank, allFailing ? 1 : 2);
    const byRegion = new Map<string, number>();
    for (const p of failing) byRegion.set(p.region, (byRegion.get(p.region) ?? 0) + 1);
    for (const [region, n] of byRegion) reasons.push({ code: "probe", region, n });
  }

  if (dd?.state === "problem") {
    if (incidentRank >= 2) {
      reasons.push({ code: "downdetector_confirms" });
    } else {
      rank = Math.max(rank, 1);
      reasons.push({ code: "downdetector_unconfirmed" });
    }
  }

  if (!awsOk) {
    reasons.push({ code: "feed_error" });
    if (rank === 0) return { level: "unknown", reasons };
  }

  return { level: BY_RANK[rank], reasons };
}
