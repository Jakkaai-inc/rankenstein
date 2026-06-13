// POST /api/v1/projects/:id/brand/confirm  { seedTopics: [...], ... } -> { brand }
// The ask-first gate: confirming unlocks generation. seedTopics is required.

import { type NextRequest } from "next/server";
import { z } from "zod";

import { handle, json, readJson, requireAccount } from "@/lib/api/http";
import { confirmBrand } from "@/lib/services/brand";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  brandName: z.string().optional(),
  industry: z.string().optional(),
  audience: z.string().optional(),
  voice: z.string().optional(),
  brandFacts: z.string().optional(),
  seedTopics: z.array(z.string()).default([]),
  competitors: z.array(z.string()).default([]),
});

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const account = await requireAccount(req);
    const { id } = await ctx.params;
    const input = Body.parse(await readJson(req));
    const brand = await confirmBrand(account.id, id, input);
    return json({ brand });
  });
}
