// Runs automatically every 5 minutes on Netlify's infrastructure (no server needed).
// Checks DownDetector + AWS's official RSS feed, cross-validates them, stores the
// result in Netlify Blobs (so the dashboard can read it), and sends a push
// notification via ntfy.sh when the status changes.

import type { Config } from "@netlify/functions";
import { getStore } from "@netlify/blobs";
import * as cheerio from "cheerio";

const DOWNDETECTOR_URL = "https://downdetector.com/status/amazon-aws/";
const AWS_RSS_URL = "https://status.aws.amazon.com/rss/all.rss";
const NTFY_TOPIC = "aws-alerts-letanom-kevino007";
const HISTORY_MAX = 60;

// Set this in Netlify: Site settings -> Environment variables -> GOOGLE_CHAT_WEBHOOK_URL
// Never hardcode it here - this repo is public and the URL contains a secret key+token.
const GOOGLE_CHAT_WEBHOOK_URL = process.env.GOOGLE_CHAT_WEBHOOK_URL;

const PROBLEM_KEYWORDS = ["problem", "outage", "issue", "reported"];
const OK_KEYWORDS = ["no problem", "status is normal", "no issues"];

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
};

interface StatusState {
  status: string;
  ddProblem: boolean;
  awsProblem: boolean;
  confirmedProblem: boolean;
  parseFailed: boolean;
  awsItems: string[];
  history: Array<{
    time: string;
    ddProblem: boolean;
    awsProblem: boolean;
    confirmedProblem: boolean;
  }>;
  lastChecked: string;
}

async function fetchDownDetectorStatus(): Promise<string> {
  const res = await fetch(DOWNDETECTOR_URL, { headers: BROWSER_HEADERS });
  const html = await res.text();
  const $ = cheerio.load(html);

  // Best-effort selectors - DownDetector's markup changes over time.
  // If detection stops working, inspect the live page and update these.
  const selectorCandidates = ["p.status-description", "div.status-title", "h1 + p", "span.status"];
  for (const sel of selectorCandidates) {
    const text = $(sel).first().text().trim();
    if (text) return text;
  }

  const pageText = $("body").text().toLowerCase();
  if (OK_KEYWORDS.some((k) => pageText.includes(k))) return "No problems detected (fallback match)";
  if (PROBLEM_KEYWORDS.some((k) => pageText.includes(k))) return "Possible problem detected (fallback match)";
  return "UNKNOWN - could not parse page, check selectors";
}

async function fetchAwsRssRecentIssues(
  minutesWindow = 60
): Promise<{ problem: boolean; items: string[] }> {
  const res = await fetch(AWS_RSS_URL, { headers: BROWSER_HEADERS });
  const xml = await res.text();

  const items: string[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  const titleRegex = /<title>([\s\S]*?)<\/title>/;
  const pubDateRegex = /<pubDate>([\s\S]*?)<\/pubDate>/;
  const cutoff = Date.now() - minutesWindow * 60 * 1000;

  let match: RegExpExecArray | null;
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const titleMatch = titleRegex.exec(block);
    const pubDateMatch = pubDateRegex.exec(block);
    if (!titleMatch || !pubDateMatch) continue;

    const pubDate = new Date(pubDateMatch[1]).getTime();
    if (!Number.isNaN(pubDate) && pubDate >= cutoff) {
      items.push(titleMatch[1].trim());
    }
  }

  return { problem: items.length > 0, items };
}

async function sendNtfy(title: string, message: string, priority = "default"): Promise<void> {
  try {
    await fetch(`https://ntfy.sh/${NTFY_TOPIC}`, {
      method: "POST",
      body: message,
      headers: { Title: title, Priority: priority, Tags: "warning,aws" },
    });
  } catch (e) {
    console.error("ntfy notification failed:", e);
  }
}

async function sendGoogleChat(title: string, message: string): Promise<void> {
  if (!GOOGLE_CHAT_WEBHOOK_URL) {
    console.error("GOOGLE_CHAT_WEBHOOK_URL env var not set, skipping Google Chat alert");
    return;
  }
  try {
    await fetch(GOOGLE_CHAT_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=UTF-8" },
      body: JSON.stringify({ text: `*${title}*\n${message}` }),
    });
  } catch (e) {
    console.error("Google Chat notification failed:", e);
  }
}

async function sendAlert(title: string, message: string, priority = "default"): Promise<void> {
  await Promise.all([sendNtfy(title, message, priority), sendGoogleChat(title, message)]);
}

export default async (req: Request) => {
  const store = getStore("aws-status");
  const prev = (await store.get("state", { type: "json" })) as StatusState | null;

  try {
    const currentStatus = await fetchDownDetectorStatus();
    const lower = currentStatus.toLowerCase();
    const parseFailed = currentStatus.startsWith("UNKNOWN");
    const wasParseFailed = prev?.parseFailed ?? false;
    const ddProblem =
      PROBLEM_KEYWORDS.some((k) => lower.includes(k)) && !OK_KEYWORDS.some((k) => lower.includes(k));

    const { problem: awsProblem, items: awsItems } = await fetchAwsRssRecentIssues(60);

    const wasConfirmedProblem = prev?.confirmedProblem ?? false;
    const isConfirmedProblem = ddProblem && awsProblem;

    // Alert only once when parsing starts failing, not every 5 minutes.
    if (parseFailed && !wasParseFailed) {
      await sendAlert(
        "⚠️ DownDetector Selector Hatası",
        `DownDetector sayfası artık mevcut selector'larla parse edilemiyor. Sayfa yapısı değişmiş olabilir, check-status.mts içindeki selectorCandidates listesini güncellemen gerekebilir.\n\n${DOWNDETECTOR_URL}`,
        "high"
      );
    } else if (!parseFailed && wasParseFailed) {
      await sendAlert("✅ Selector Sorunu Düzeldi", "DownDetector sayfası tekrar başarıyla parse ediliyor.");
    }

    if (isConfirmedProblem && !wasConfirmedProblem) {
      await sendAlert(
        "🔴 AWS Outage Confirmed",
        `DownDetector AND AWS's own status feed both indicate a problem.\n\nDownDetector: ${currentStatus}\n\nAWS RSS:\n${awsItems
          .slice(0, 5)
          .join("\n")}\n\n${DOWNDETECTOR_URL}`,
        "urgent"
      );
    } else if (ddProblem && !awsProblem && !wasConfirmedProblem) {
      await sendAlert(
        "🟡 Possible AWS Issue (unconfirmed)",
        `DownDetector reports an issue but AWS's own status page doesn't show anything yet.\n\nDownDetector: ${currentStatus}\n${DOWNDETECTOR_URL}`,
        "default"
      );
    } else if (!isConfirmedProblem && wasConfirmedProblem) {
      await sendAlert(
        "✅ AWS Status Back to Normal",
        "Both DownDetector and AWS's status feed look normal again."
      );
    }

    const history = [
      ...(prev?.history ?? []),
      {
        time: new Date().toISOString(),
        ddProblem,
        awsProblem,
        confirmedProblem: isConfirmedProblem,
      },
    ].slice(-HISTORY_MAX);

    const newState: StatusState = {
      status: currentStatus,
      ddProblem,
      awsProblem,
      confirmedProblem: isConfirmedProblem,
      parseFailed,
      awsItems,
      history,
      lastChecked: new Date().toISOString(),
    };

    await store.setJSON("state", newState);

    return new Response("ok");
  } catch (err) {
    // Network failure, DownDetector/AWS unreachable, or an unexpected bug.
    // Don't let this fail silently - alert so we know the checker itself is broken.
    const message = err instanceof Error ? err.message : String(err);
    console.error("check-status failed:", err);
    await sendAlert(
      "🚨 AWS Status Checker Crashed",
      `check-status fonksiyonu çalışırken hata aldı:\n\n${message}`,
      "urgent"
    );
    return new Response("error", { status: 500 });
  }
};

// Runs every 5 minutes. Netlify accepts standard 5-field cron syntax.
export const config: Config = {
  schedule: "*/5 * * * *",
};
