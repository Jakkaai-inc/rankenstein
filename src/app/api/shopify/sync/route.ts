// POST /api/shopify/sync  { projectId } -> { products, articles, total }
// Pulls the connected store's catalog into Page rows. Cookie or bearer auth.

import { type NextRequest } from "next/server";
import { z } from "zod";

import { handle, json, readJson } from "@/lib/api/http";
import { prisma } from "@/lib/db";
import { requireAccountFlexible, syncCatalog } from "@/lib/shopify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const Body = z.object({ projectId: z.string() });

export async function POST(req: NextRequest) {
  return handle(async () => {
    const account = await requireAccountFlexible(req);
    const { projectId } = Body.parse(await readJson(req));

    const project = await prisma.project.findFirst({ where: { id: projectId, accountId: account.id }, select: { id: true } });
    if (!project) return json({ error: "project not found" }, 404);

    const result = await syncCatalog(projectId);
    return json(result);
  });
}
