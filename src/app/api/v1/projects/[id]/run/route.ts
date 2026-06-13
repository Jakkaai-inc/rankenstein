// POST /api/v1/projects/:id/run  { limit?, runId? } -> { runId, done, flagged, stopped }
// Runs a catalog-rewrite batch SERVER-SIDE (App Runner is in-VPC with RDS, so
// this is immune to laptop IP churn). Drive it with repeated calls over HTTPS;
// the orchestrator skips already-processed products via sourceRef, so each call
// advances. Keep limit small to stay under the request timeout.

import { type NextRequest } from "next/server";
import { z } from "zod";

import { handle, json, readJson, requireAccount } from "@/lib/api/http";
import { prisma } from "@/lib/db";
import { runCatalogRewrite } from "@/lib/run/orchestrator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const Body = z.object({ limit: z.number().min(1).max(5).default(2), runId: z.string().optional() });

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const account = await requireAccount(req);
    const { id } = await ctx.params;
    const { limit, runId } = Body.parse(await readJson(req).catch(() => ({})));

    const project = await prisma.project.findFirst({ where: { id, accountId: account.id } });
    if (!project) return json({ error: "not found" }, 404);

    const run = runId
      ? await prisma.run.findUniqueOrThrow({ where: { id: runId } })
      : await prisma.run.create({ data: { projectId: id, status: "QUEUED" } });

    const result = await runCatalogRewrite({ projectId: id, runId: run.id, limit });
    return json({ runId: run.id, ...result });
  });
}
