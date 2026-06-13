// POST /api/shopify/publish  { contentItemId }
//   -> { contentItemId, status, publishedUrl, snapshotVersion, kind }
// Publishes an APPROVED ContentItem to the live store, snapshotting the live
// state into a ContentVersion BEFORE the push. Cookie or bearer auth.

import { type NextRequest } from "next/server";
import { z } from "zod";

import { handle, json, readJson } from "@/lib/api/http";
import { prisma } from "@/lib/db";
import { publishContentItem, requireAccountFlexible } from "@/lib/shopify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const Body = z.object({ contentItemId: z.string() });

export async function POST(req: NextRequest) {
  return handle(async () => {
    const account = await requireAccountFlexible(req);
    const { contentItemId } = Body.parse(await readJson(req));

    // tenant isolation: the item's project must belong to the caller.
    const item = await prisma.contentItem.findFirst({
      where: { id: contentItemId, project: { accountId: account.id } },
      select: { id: true },
    });
    if (!item) return json({ error: "content item not found" }, 404);

    const result = await publishContentItem(contentItemId);
    return json(result);
  });
}
