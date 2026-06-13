// POST /api/shopify/rollback  { contentItemId, version? }
//   -> { contentItemId, restoredVersion, preRollbackSnapshotVersion, deletedArticle }
// One-click rollback: re-pushes a snapshot (default: the latest pre-publish live
// snapshot) to the live store. Cookie or bearer auth.

import { type NextRequest } from "next/server";
import { z } from "zod";

import { handle, json, readJson } from "@/lib/api/http";
import { prisma } from "@/lib/db";
import { requireAccountFlexible, rollbackContentItem } from "@/lib/shopify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const Body = z.object({ contentItemId: z.string(), version: z.number().int().positive().optional() });

export async function POST(req: NextRequest) {
  return handle(async () => {
    const account = await requireAccountFlexible(req);
    const { contentItemId, version } = Body.parse(await readJson(req));

    const item = await prisma.contentItem.findFirst({
      where: { id: contentItemId, project: { accountId: account.id } },
      select: { id: true },
    });
    if (!item) return json({ error: "content item not found" }, 404);

    const result = await rollbackContentItem(contentItemId, version);
    return json(result);
  });
}
