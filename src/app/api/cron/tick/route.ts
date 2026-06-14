// POST|GET /api/cron/tick  (header `x-cron-secret: $CRON_SECRET`, or ?secret=)
// Externally callable by a scheduler (EventBridge Scheduler, a worker, or cron).
// Scans scheduled RunConfigs and fires the due ones (detached). Returns a summary.
//
// Guarded by CRON_SECRET because it is publicly reachable. If CRON_SECRET is not
// set the endpoint is disabled (503) so it can never fire unauthenticated.

import { type NextRequest, NextResponse } from "next/server";

import { tickScheduledRuns } from "@/lib/run/scheduler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "scheduler not configured" }, { status: 503 });
  const provided = req.headers.get("x-cron-secret") ?? new URL(req.url).searchParams.get("secret");
  if (provided !== secret) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const result = await tickScheduledRuns(); // fires due runs detached; returns fast
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error("[cron/tick] error:", e);
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "tick failed" }, { status: 500 });
  }
}

export { handle as GET, handle as POST };
