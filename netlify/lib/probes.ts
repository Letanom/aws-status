import type { ProbeResult } from "./types.ts";

/** Kimlik doğrulama gerektirmeyen, herkese açık bölgesel uç noktalar. 5xx dışındaki her HTTP yanıtı "erişilebilir" sayılır. */
const URLS: Record<string, (region: string) => string> = {
  dynamodb: (r) => `https://dynamodb.${r}.amazonaws.com/ping`,
  sts: (r) => `https://sts.${r}.amazonaws.com/`,
  s3: (r) => `https://s3.${r}.amazonaws.com/`,
  ec2: (r) => `https://ec2.${r}.amazonaws.com/`,
  sqs: (r) => `https://sqs.${r}.amazonaws.com/`,
};

export const PROBE_SERVICES_ALL = Object.keys(URLS);
const REGION_OK = /^[a-z]{2}(?:-gov)?-[a-z]+-\d+$/;

export interface ProbeOptions {
  timeoutMs: number;
  slowMs: number;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

export async function probeOne(service: string, region: string, o: ProbeOptions): Promise<Omit<ProbeResult, "streak">> {
  const f = o.fetchImpl ?? fetch;
  const now = o.now ?? Date.now;
  const url = URLS[service]?.(region);
  const base = { service, region, ts: now() };
  if (!url || !REGION_OK.test(region)) {
    return { ...base, ok: false, slow: false, ms: null, status: null, err: "geçersiz sonda tanımı" };
  }
  const t0 = performance.now();
  try {
    const res = await f(url, {
      method: "GET",
      redirect: "manual",
      headers: { "User-Agent": "aws-status-panel/2.0" },
      signal: AbortSignal.timeout(o.timeoutMs),
    });
    const ms = Math.round(performance.now() - t0);
    res.body?.cancel().catch(() => {});
    const ok = res.status > 0 && res.status < 500;
    return { ...base, ok, slow: ok && ms > o.slowMs, ms, status: res.status, err: ok ? null : `HTTP ${res.status}` };
  } catch (e) {
    const name = e instanceof Error ? e.name : "";
    const err = name === "TimeoutError" || name === "AbortError" ? "zaman aşımı" : e instanceof Error ? e.message.slice(0, 80) : "hata";
    return { ...base, ok: false, slow: false, ms: null, status: null, err };
  }
}

export async function runProbes(regions: string[], services: string[], o: ProbeOptions): Promise<Omit<ProbeResult, "streak">[]> {
  const jobs: Promise<Omit<ProbeResult, "streak">>[] = [];
  for (const region of regions) for (const service of services) jobs.push(probeOne(service, region, o));
  return Promise.all(jobs);
}
