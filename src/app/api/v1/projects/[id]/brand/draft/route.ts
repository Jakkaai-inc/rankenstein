// POST /api/v1/projects/:id/brand/draft -> { brand }
// Crawls the site and drafts brand guidelines. Refuse-and-flag on unreadable
// sites (returns a manual-entry stub, never an invented brand).

import { type NextRequest } from "next/server";

import { handle, json, requireAccount } from "@/lib/api/http";
import { draftBrandForProject } from "@/lib/services/brand";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const account = await requireAccount(req);
    const { id } = await ctx.params;
    const brand = await draftBrandForProject(account.id, id);
    return json({ brand });
  });
}
