const env = (k: string, d = ""): string => (process.env[k] ?? d).trim();

const num = (k: string, d: number): number => {
  const n = Number(env(k));
  return Number.isFinite(n) && n > 0 ? n : d;
};

const list = (k: string, d: string[] = []): string[] => {
  const raw = env(k);
  if (!raw) return d;
  if (raw.toLowerCase() === "off") return [];
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
};

export const DEFAULT_PROBE_REGIONS = [
  "us-east-1",
  "us-east-2",
  "us-west-2",
  "eu-west-1",
  "eu-central-1",
  "ap-southeast-1",
  "ap-northeast-1",
  "sa-east-1",
];

export const FEED_URL = "https://status.aws.amazon.com/rss/all.rss";
export const DD_URL = "https://downdetector.com/status/amazon-aws/";

/** Ortam değişkenleri çağrı anında okunur (testler ve Netlify için). */
export function getConfig() {
  return {
    intervalMin: 5,
    uiRefreshSec: 60,
    activeHours: num("ACTIVE_HOURS", 48),
    probeRegions: list("PROBE_REGIONS", DEFAULT_PROBE_REGIONS),
    probeServices: list("PROBE_SERVICES", ["dynamodb", "sts", "s3", "ec2"]),
    probeTimeoutMs: num("PROBE_TIMEOUT_MS", 5000),
    slowMs: num("PROBE_SLOW_MS", 2500),
    downdetector: env("DOWNDETECTOR", "on").toLowerCase() !== "off",
    watchRegions: list("WATCH_REGIONS"),
    watchServices: list("WATCH_SERVICES"),
    alertLang: env("ALERT_LANG", "tr").toLowerCase() === "en" ? "en" : "tr",
    alertInfo: env("ALERT_INFO", "false").toLowerCase() === "true",
    ntfyTopic: env("NTFY_TOPIC"),
    ntfyServer: env("NTFY_SERVER", "https://ntfy.sh").replace(/\/+$/, ""),
    ntfyToken: env("NTFY_TOKEN"),
    chatWebhook: env("GOOGLE_CHAT_WEBHOOK_URL"),
    webhook: env("WEBHOOK_URL"),
    siteUrl: env("URL"),
  } as const;
}

export type Config = ReturnType<typeof getConfig>;
