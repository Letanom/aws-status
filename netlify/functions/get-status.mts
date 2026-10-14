// Panelin okuduğu uç noktalar:
//   /api/status   tam anlık görüntü (panel bunu kullanır)
//   /api/health   dış izleme için: veri tazeyse 200, bayatsa 503
import type { Config } from "@netlify/functions";
import { blobStorage } from "../lib/store.ts";
import { readSnapshot, runCheck } from "../lib/check.ts";

const STALE_AFTER_MS = 16 * 60_000;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
    },
  });

export default async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS" } });
  }
  const storage = blobStorage();
  let snap = await readSnapshot(storage).catch((e) => {
    console.error("depo okunamadı:", e);
    return null;
  });
  if (!snap) {
    // İlk açılış: zamanlanmış kontrol henüz çalışmadıysa tek seferlik kontrolü burada yap.
    try {
      snap = await runCheck({ storage });
    } catch (e) {
      console.error("ilk kontrol başarısız:", e);
      return json({ error: "no_data" }, 503);
    }
  }
  if (new URL(req.url).pathname.replace(/\/+$/, "").endsWith("/health")) {
    const age = Date.now() - snap.updatedAt;
    return json({ ok: age <= STALE_AFTER_MS, ageSeconds: Math.round(age / 1000), level: snap.overall.level }, age <= STALE_AFTER_MS ? 200 : 503);
  }
  return json(snap);
};

export const config: Config = {
  path: ["/api/status", "/api/health"],
};
