// Read-only endpoint the dashboard calls to fetch the latest stored status.
// Exposed at /api/status (see the "path" config below).

import type { Config } from "@netlify/functions";
import { getStore } from "@netlify/blobs";

export default async (req: Request) => {
  const store = getStore("aws-status");
  const state = await store.get("state", { type: "json" });

  return new Response(JSON.stringify(state ?? { status: "Henüz kontrol edilmedi", history: [] }), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
    },
  });
};

export const config: Config = {
  path: "/api/status",
};
