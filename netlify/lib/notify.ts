import type { Config } from "./config.ts";

export interface Msg {
  title: string;
  body: string;
  priority: 1 | 2 | 3 | 4 | 5;
  tags: string[];
  kind: "alert" | "resolved";
}

async function post(fetchImpl: typeof fetch, url: string, body: unknown, headers: Record<string, string> = {}): Promise<void> {
  const res = await fetchImpl(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

/**
 * Mesajları tanımlı tüm kanallara gönderir (ntfy, Google Chat, genel webhook). Bir kanalın hatası diğerlerini engellemez.
 * sent: başarılı gönderim sayısı, failed: başarısız gönderim sayısı. Hiç kanal tanımlı değilse ikisi de 0 olur.
 */
export async function deliver(msgs: Msg[], cfg: Config, fetchImpl: typeof fetch): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;
  const url = cfg.siteUrl || undefined;

  for (const m of msgs) {
    const jobs: Promise<void>[] = [];
    if (cfg.ntfyTopic) {
      const headers: Record<string, string> = {};
      if (cfg.ntfyToken) headers.Authorization = `Bearer ${cfg.ntfyToken}`;
      jobs.push(post(fetchImpl, cfg.ntfyServer, { topic: cfg.ntfyTopic, title: m.title, message: m.body, priority: m.priority, tags: m.tags, click: url }, headers));
    }
    if (cfg.chatWebhook) {
      jobs.push(post(fetchImpl, cfg.chatWebhook, { text: `*${m.title}*\n${m.body}${url ? `\n${url}` : ""}` }));
    }
    if (cfg.webhook) {
      jobs.push(post(fetchImpl, cfg.webhook, { title: m.title, body: m.body, text: `${m.title}\n${m.body}`, priority: m.priority, kind: m.kind, url }));
    }
    const results = await Promise.allSettled(jobs);
    for (const r of results) {
      if (r.status === "fulfilled") sent++;
      else {
        failed++;
        console.error("bildirim gönderilemedi:", r.reason instanceof Error ? r.reason.message : r.reason);
      }
    }
  }
  return { sent, failed };
}
