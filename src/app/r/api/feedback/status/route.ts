// GET /r/api/feedback/status?pieceId=&since=<version>
//
// The review client polls this while the article view is frozen after "Send
// feedback". Reports the rewrite job's state and the current latest version.
// "done" once a version newer than `since` exists (covers the case where the
// in-memory job was lost, e.g. instance recycle: we still detect the new
// version from the DB and unfreeze).

import { type NextRequest } from "next/server";

import { handle, json } from "@/lib/api/http";
import { prisma } from "@/lib/db";
import { getAccount } from "@/lib/session";
import { getJob } from "../jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return handle(async () => {
    const account = await getAccount();
    if (!account) return json({ error: "unauthenticated" }, 401);

    const pieceId = req.nextUrl.searchParams.get("pieceId");
    const since = Number(req.nextUrl.searchParams.get("since") ?? "0");
    if (!pieceId) return json({ error: "pieceId required" }, 400);

    const piece = await prisma.contentItem.findFirst({
      where: { id: pieceId, project: { accountId: account.id } },
      select: { id: true },
    });
    if (!piece) return json({ error: "not found" }, 404);

    const latest = await latestVersion(pieceId);
    const job = getJob(pieceId);

    // DB is the source of truth for "a newer version exists": if it does, the
    // rewrite finished regardless of whether the in-memory job survived.
    if (latest > since) {
      return json({ state: "done", version: latest, message: job?.message ?? `Updated to v${latest}.`, outcome: job?.outcome ?? null });
    }
    if (job?.state === "error") {
      return json({ state: "error", version: latest, message: job.message ?? "Rewrite failed.", outcome: job.outcome ?? null });
    }
    if (job?.state === "rewriting") {
      return json({ state: "rewriting", version: latest });
    }
    // No newer version and no active job: idle (nothing in flight).
    return json({ state: "idle", version: latest });
  });
}

async function latestVersion(pieceId: string): Promise<number> {
  const agg = await prisma.contentVersion.aggregate({ where: { contentItemId: pieceId }, _max: { version: true } });
  return agg._max.version ?? 1;
}
