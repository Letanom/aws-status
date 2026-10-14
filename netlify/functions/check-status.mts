// Her 5 dakikada bir çalışır: AWS durum akışı, canlı sondalar ve DownDetector'ı çapraz doğrular,
// sonucu Netlify Blobs'a yazar ve durum değişince bildirim gönderir. Mantığın tamamı netlify/lib/check.ts içindedir.
import type { Config } from "@netlify/functions";
import { blobStorage } from "../lib/store.ts";
import { runCheck } from "../lib/check.ts";

export default async () => {
  try {
    const s = await runCheck({ storage: blobStorage() });
    console.log(
      `kontrol tamam: seviye=${s.overall.level} aws=${s.sources.aws.ok} sonda=${s.sources.probes.total - s.sources.probes.failed}/${s.sources.probes.total} dd=${s.sources.downdetector.state ?? "-"}`,
    );
  } catch (e) {
    console.error("check-status başarısız:", e);
  }
  return new Response("tamam");
};

export const config: Config = {
  schedule: "*/5 * * * *",
};
