import type { DDState } from "./types.ts";
import { DD_URL } from "./config.ts";

export interface DownDetectorResult {
  ok: boolean;
  state: DDState;
  ms: number | null;
}

/** DownDetector sayfasındaki özet cümleden durumu çıkarır. Cümle bulunamazsa (ör. bot koruması sayfası) "unknown" döner. */
export function interpretDownDetector(html: string): DDState {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .toLowerCase();
  if (/no current problems/.test(text)) return "ok";
  if (/possible problems/.test(text)) return "possible";
  if (/indicate problems|reports indicate (?:a )?problem/.test(text)) return "problem";
  return "unknown";
}

export async function fetchDownDetector(fetchImpl: typeof fetch, timeoutMs: number): Promise<DownDetectorResult> {
  const t0 = performance.now();
  const res = await fetchImpl(DD_URL, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; aws-status-panel/2.0)",
      Accept: "text/html",
      "Accept-Language": "en",
    },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`DownDetector HTTP ${res.status} döndü`);
  const state = interpretDownDetector(await res.text());
  if (state === "unknown") throw new Error("DownDetector sayfasından durum okunamadı");
  return { ok: true, state, ms: Math.round(performance.now() - t0) };
}
