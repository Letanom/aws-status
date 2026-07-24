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

export default async (req: Request) => {
  const store = getStore("aws-status");

  const currentStatus = await fetchDownDetectorStatus();
  const lower = currentStatus.toLowerCase();
  const ddProblem =
    PROBLEM_KEYWORDS.some((k) => lower.includes(k)) && !OK_KEYWORDS.some((k) => lower.includes(k));

  const { problem: awsProblem, items: awsItems } = await fetchAwsRssRecentIssues(60);

  const prev = (await store.get("state", { type: "json" })) as StatusState | null;
  const wasConfirmedProblem = prev?.confirmedProblem ?? false;

  const isConfirmedProblem = ddProblem && awsProblem;

  if (isConfirmedProblem && !wasConfirmedProblem) {
    await sendNtfy(
      "🔴 AWS Outage Confirmed",
      `DownDetector AND AWS's own status feed both indicate a problem.\n\nDownDetector: ${currentStatus}\n\nAWS RSS:\n${awsItems
        .slice(0, 5)
        .join("\n")}\n\n${DOWNDETECTOR_URL}`,
      "urgent"
    );
  } else if (ddProblem && !awsProblem && !wasConfirmedProblem) {
    await sendNtfy(
      "🟡 Possible AWS Issue (unconfirmed)",
      `DownDetector reports an issue but AWS's own status page doesn't show anything yet.\n\nDownDetector: ${currentStatus}\n${DOWNDETECTOR_URL}`,
      "default"
    );
  } else if (!isConfirmedProblem && wasConfirmedProblem) {
    await sendNtfy(
      "✅ AWS Status Back to Normal",
      "Both DownDetector and AWS's status feed look normal again.",
      "default"
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
    awsItems,
    history,
    lastChecked: new Date().toISOString(),
  };

  await store.setJSON("state", newState);

  return new Response("ok");
};

// Runs every 5 minutes. Netlify accepts standard 5-field cron syntax.
export const config: Config = {
  schedule: "*/5 * * * *",
};
