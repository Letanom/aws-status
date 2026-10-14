export type Severity = "ok" | "info" | "degraded" | "disruption";
export type Level = Severity | "unknown";

export const RANK: Record<Severity, number> = { ok: 0, info: 1, degraded: 2, disruption: 3 };

export type DDState = "ok" | "possible" | "problem" | "unknown";

export interface IncidentUpdate {
  ts: number;
  title: string;
  text: string;
  severity: Severity;
  resolved: boolean;
}

export interface Incident {
  id: string;
  /** AWS'nin akıştaki anahtarı, ör. "ec2" ya da "multipleservices" */
  service: string;
  region: string;
  /** Etkilenen servisler (kanonik anahtarlar). Bilinmiyorsa boş. */
  services: string[];
  title: string;
  /** Şu anki şiddet. Çözüldüyse "ok". */
  severity: Severity;
  /** Olay boyunca ulaşılan en yüksek şiddet */
  peak: Severity;
  status: "active" | "resolved" | "stale";
  firstTs: number;
  lastTs: number;
  resolvedTs: number | null;
  updates: IncidentUpdate[];
}

export interface ProbeResult {
  service: string;
  region: string;
  ok: boolean;
  slow: boolean;
  ms: number | null;
  status: number | null;
  err?: string | null;
  /** Üst üste başarısız deneme sayısı */
  streak: number;
  ts: number;
}

export interface Reason {
  code: "incident" | "probe" | "downdetector_unconfirmed" | "downdetector_confirms" | "feed_error";
  incidentId?: string;
  region?: string;
  service?: string;
  n?: number;
}

/** t: epoch saniye, l: seviye (-1 bilinmiyor, 0-3), m: medyan sonda gecikmesi (ms), a: aktif olay, f: başarısız sonda */
export interface HistoryPoint {
  t: number;
  l: number;
  m: number | null;
  a: number;
  f: number;
}

/** Günlük özet. n: kontrol sayısı, w: bilgi, x: bozulma, o: kesinti, u: doğrulanamayan */
export interface DayAgg {
  d: string;
  n: number;
  w: number;
  x: number;
  o: number;
  u: number;
}

export interface Snapshot {
  v: 2;
  updatedAt: number;
  overall: { level: Level; reasons: Reason[] };
  sources: {
    aws: { ok: boolean; ms: number | null; items: number; error: string | null };
    downdetector: { enabled: boolean; ok: boolean; state: DDState | null; ms: number | null; error: string | null };
    probes: { total: number; failed: number; slow: number; ms: number | null };
  };
  incidents: Incident[];
  probes: ProbeResult[];
  probeSeries: Record<string, (number | null)[]>;
  history: HistoryPoint[];
  days: DayAgg[];
  catalog: {
    services: Record<string, string>;
    regions: Record<string, string>;
    coreServices: string[];
    coreRegions: string[];
  };
  meta: {
    intervalMin: number;
    uiRefreshSec: number;
    activeHours: number;
    firstSeen: number;
    feedUrl: string;
    ddUrl: string;
    probeRegions: string[];
    probeServices: string[];
    probeTimeoutMs: number;
  };
}
