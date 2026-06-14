// POST /r/api/feedback { pieceId }  — start a rewrite from the reviewer's open
// comments on the latest version. Returns immediately with the job state so the
// client can freeze the article view and poll /r/api/feedback/status until the
// new version lands.
//
// The rewrite runs to completion inside this request and the result is recorded
// in the in-memory job map (see jobs.ts). The client's submit fetch may resolve
// with the final state directly, OR the client may poll status — both read the
// same job, so either path works.

import { type NextRequest } from "next/server";

import { handle, json, readJson } from "@/lib/api/http";
import { prisma } from "@/lib/db";
import { getAccount } from "@/lib/session";
import { runFeedbackRewrite } from "@/app/review/actions";
import { getJob, startJob, finishJob } from "./jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// A rewrite can run long; give the request room (App Runner caps separately).
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  return handle(async () => {
    const account = await getAccount();
    if (!account) return json({ error: "unauthenticated" }, 401);

    const body = (await readJson(req)) as { pieceId?: string };
    const pieceId = body?.pieceId;
    if (!pieceId) return json({ error: "pieceId required" }, 400);

    // Ownership check.
    const piece = await prisma.contentItem.findFirst({
      where: { id: pieceId, project: { accountId: account.id } },
      select: { id: true },
    });
    if (!piece) return json({ error: "not found" }, 404);

    // If a rewrite is already in flight for this piece, do not start another.
    const existing = getJob(pieceId);
    if (existing && existing.state === "rewriting") {
      return json({ state: "rewriting", message: "A rewrite is already in progress." });
    }

    const fromVersion = (await latestVersion(pieceId)) ?? 1;
    startJob(pieceId, fromVersion);

    try {
      const outcome = await runFeedbackRewrite(pieceId);
      if (outcome.ok && outcome.newVersion) {
        finishJob(pieceId, {
          state: "done",
          newVersion: outcome.newVersion,
          outcome,
          message: `Your feedback was accepted. The piece was updated to v${outcome.newVersion}.`,
        });
        return json({ state: "done", version: outcome.newVersion, message: `Your feedback was accepted. The piece was updated to v${outcome.newVersion}.`, outcome });
      }
      // Not ok: a no-op, a refusal, or an error. Surface it; no new version.
      finishJob(pieceId, { state: "error", message: outcome.error ?? "No change was made.", outcome });
      return json({ state: "error", message: outcome.error ?? "No change was made.", outcome });
    } catch (err) {
      const message = (err as Error).message || "Rewrite failed.";
      finishJob(pieceId, { state: "error", message });
      return json({ state: "error", message }, 500);
    }
  });
}

async function latestVersion(pieceId: string): Promise<number> {
  const agg = await prisma.contentVersion.aggregate({ where: { contentItemId: pieceId }, _max: { version: true } });
  return agg._max.version ?? 1;
}
