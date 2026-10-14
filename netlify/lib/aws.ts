import { load } from "cheerio";
import { RANK, type Incident, type IncidentUpdate, type Severity } from "./types.ts";
import { SERVICE_PATTERNS, canonicalService } from "./catalog.ts";
import { FEED_URL } from "./config.ts";

const REGION = "(?:us-gov|us|eu|ap|sa|ca|me|af|il|mx)-[a-z]+-\\d+";
/** guid örneği: https://status.aws.amazon.com/#multipleservices-me-central-1_1789468030 */
const GUID_RE = new RegExp(`#([a-z0-9-]+?)-(${REGION}|global)_(\\d{9,11})\\s*$`, "i");
const GUID_LOOSE = /#(.+?)_(\d{9,11})\s*$/;
const HOUR = 3600_000;
const GROUP_GAP_MS = 24 * HOUR;
const KEEP_MS = 90 * 24 * HOUR;
const MAX_INCIDENTS = 150;
const MAX_UPDATES = 8;
const BY_RANK: Severity[] = ["ok", "info", "degraded", "disruption"];

interface RawItem {
  service: string;
  region: string;
  ts: number;
  title: string;
  text: string;
}

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

const RESOLVED_RE =
  /operating normally|\[resolved\]|\b(?:has|have|had) been (?:fully )?(?:resolved|restored)\b|\b(?:is|was) (?:now )?(?:fully )?(?:resolved|restored|recovered)\b/i;
const DISRUPTION_TEXT_RE =
  /no longer available|(?:can[’']?t|cannot|can not|unable to) be (?:restored|recovered)|unable to restore/i;
/** "...once the issue has been resolved" gibi gelecekle ilgili cümleler çözüldü sayılmaz. */
const FUTURE_CLAUSE_RE = /\b(?:until|once|when|before|after|if|unless|until)\b[^.;]*[.;]?/gi;

export function classify(title: string, text: string): { severity: Severity; resolved: boolean } {
  const t = title.toLowerCase();
  const body = text.slice(0, 800).replace(FUTURE_CLAUSE_RE, " ");
  const resolved = RESOLVED_RE.test(title) || RESOLVED_RE.test(body);
  let severity: Severity;
  if (/operating normally/.test(t)) severity = "ok";
  else if (/informational/.test(t)) severity = "info";
  else if (/disruption|outage|unavailable/.test(t) || DISRUPTION_TEXT_RE.test(text.slice(0, 800))) severity = "disruption";
  else severity = "degraded";
  return { severity, resolved };
}

function parseItems(xml: string): RawItem[] {
  const $ = load(xml, { xmlMode: true });
  if ($("rss > channel, channel").length === 0) throw new Error("Yanıt bir RSS akışı değil");
  const out: RawItem[] = [];
  $("item").each((_, el) => {
    const item = $(el);
    const title = clean(item.children("title").text());
    const guid = (item.children("guid").text() || item.children("link").text()).trim();
    const descHtml = item.children("description").text();

    let service = "unknown";
    let region = "global";
    let ts = NaN;
    const m = GUID_RE.exec(guid);
    if (m) {
      service = m[1].toLowerCase();
      region = m[2].toLowerCase();
      ts = Number(m[3]) * 1000;
    } else {
      const loose = GUID_LOOSE.exec(guid);
      if (loose) {
        service = loose[1].toLowerCase();
        ts = Number(loose[2]) * 1000;
      }
    }
    if (!Number.isFinite(ts)) ts = Date.parse(item.children("pubDate").text().trim());
    if (!Number.isFinite(ts) || !title) return;

    const text = clean(load(descHtml, {}, false).root().text()).slice(0, 1500);
    out.push({ service, region, ts, title, text });
  });
  return out;
}

function affectedServices(service: string, items: RawItem[]): string[] {
  if (service !== "multipleservices" && service !== "unknown") return [canonicalService(service)];
  const blob = items.map((i) => `${i.title} ${i.text}`).join(" ");
  return SERVICE_PATTERNS.filter(([, , re]) => re.test(blob)).map(([k]) => k);
}

function toIncident(items: RawItem[], now: number, activeMs: number): Incident {
  const first = items[0];
  const all: IncidentUpdate[] = items.map((it) => {
    const c = classify(it.title, it.text);
    return { ts: it.ts, title: it.title, text: it.text, severity: c.severity, resolved: c.resolved };
  });
  const last = all[all.length - 1];
  const peak = BY_RANK[Math.max(...all.map((u) => RANK[u.severity]))];
  const lastOpen = [...all].reverse().find((u) => !u.resolved) ?? last;
  const status: Incident["status"] = last.resolved ? "resolved" : now - last.ts <= activeMs ? "active" : "stale";
  return {
    id: `${first.service}-${first.region}-${Math.floor(first.ts / 1000)}`,
    service: first.service,
    region: first.region,
    services: affectedServices(first.service, items),
    title: lastOpen.title,
    severity: last.resolved ? "ok" : last.severity,
    peak,
    status,
    firstTs: first.ts,
    lastTs: last.ts,
    resolvedTs: last.resolved ? last.ts : null,
    updates: all.slice(-MAX_UPDATES),
  };
}

/** Aynı servis ve bölgedeki güncellemeler tek olayda toplanır. 24 saatten uzun boşluk ya da çözüm bildirimi yeni olay başlatır. */
export function parseFeed(xml: string, now: number, activeHours: number): { items: number; incidents: Incident[] } {
  const items = parseItems(xml);
  const activeMs = activeHours * HOUR;
  const byKey = new Map<string, RawItem[]>();
  for (const it of items) {
    const k = `${it.service}|${it.region}`;
    const list = byKey.get(k);
    if (list) list.push(it);
    else byKey.set(k, [it]);
  }
  const incidents: Incident[] = [];
  for (const list of byKey.values()) {
    list.sort((a, b) => a.ts - b.ts);
    let cur: RawItem[] = [];
    const flush = () => {
      if (cur.length) incidents.push(toIncident(cur, now, activeMs));
      cur = [];
    };
    for (const it of list) {
      const prev = cur[cur.length - 1];
      if (prev && (it.ts - prev.ts > GROUP_GAP_MS || classify(prev.title, prev.text).resolved)) flush();
      cur.push(it);
    }
    flush();
  }
  incidents.sort((a, b) => b.lastTs - a.lastTs);
  return { items: items.length, incidents };
}

function restatus(inc: Incident, now: number, activeMs: number): Incident {
  if (inc.status === "resolved") return inc;
  return { ...inc, status: now - inc.lastTs <= activeMs ? "active" : "stale" };
}

/** Akış kısalsa bile geçmiş kaybolmasın diye olaylar kendi deposunda tutulur. */
export function mergeIncidents(stored: Incident[], fresh: Incident[], now: number, activeHours: number): Incident[] {
  const activeMs = activeHours * HOUR;
  const map = new Map<string, Incident>();
  for (const inc of stored) map.set(inc.id, restatus(inc, now, activeMs));
  for (const inc of fresh) map.set(inc.id, inc);
  return [...map.values()]
    .filter((i) => now - i.lastTs <= KEEP_MS)
    .sort((a, b) => b.lastTs - a.lastTs)
    .slice(0, MAX_INCIDENTS);
}

export async function fetchFeed(fetchImpl: typeof fetch, timeoutMs: number): Promise<{ xml: string; ms: number }> {
  const t0 = performance.now();
  const res = await fetchImpl(FEED_URL, {
    headers: { "User-Agent": "aws-status-panel/2.0", Accept: "application/rss+xml, application/xml, text/xml" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`AWS durum akışı HTTP ${res.status} döndü`);
  const xml = await res.text();
  return { xml, ms: Math.round(performance.now() - t0) };
}
