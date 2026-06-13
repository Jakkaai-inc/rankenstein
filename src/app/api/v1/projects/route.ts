// GET  /api/v1/projects        -> { projects: [...] }
// POST /api/v1/projects { name, siteUrl } -> { project }  (queues crawl + brand draft)

import { type NextRequest } from "next/server";
import { z } from "zod";

import { handle, json, readJson, requireAccount } from "@/lib/api/http";
import { projectDetail, projectListItem } from "@/lib/api/serializers";
import { createProject, getProject, listProjects } from "@/lib/services/projects";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return handle(async () => {
    const account = await requireAccount(req);
    const projects = await listProjects(account.id);
    return json({ projects: projects.map(projectListItem) });
  });
}

const Body = z.object({
  name: z.string().trim().min(1, "name required"),
  siteUrl: z.string().trim().min(1, "site URL required"),
});

export async function POST(req: NextRequest) {
  return handle(async () => {
    const account = await requireAccount(req);
    const input = Body.parse(await readJson(req));
    const created = await createProject(account.id, input);
    // return the full detail shape so the client can route straight into it
    const full = await getProject(account.id, created.id);
    return json({ project: full ? projectDetail(full) : null }, 201);
  });
}
