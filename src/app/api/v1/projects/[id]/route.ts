// GET /api/v1/projects/:id -> { project }  (full detail + onboarding gate + runs)

import { type NextRequest } from "next/server";

import { handle, json, requireAccount } from "@/lib/api/http";
import { projectDetail } from "@/lib/api/serializers";
import { NotFoundError } from "@/lib/services/errors";
import { getProject } from "@/lib/services/projects";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const account = await requireAccount(req);
    const { id } = await ctx.params;
    const project = await getProject(account.id, id);
    if (!project) throw new NotFoundError("project not found");
    return json({ project: projectDetail(project) });
  });
}
