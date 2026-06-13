// Project service — the shared core behind both the web server actions and the
// /api/v1 routes. All reads are scoped by accountId (tenant isolation).

import { prisma } from "@/lib/db";

import { NotFoundError, ServiceError } from "./errors";

export function normalizeSiteUrl(raw: string): string {
  const trimmed = raw.trim();
  return trimmed.startsWith("http") ? trimmed : `https://${trimmed}`;
}

export async function listProjects(accountId: string) {
  return prisma.project.findMany({
    where: { accountId },
    include: { brandProfile: true, shopify: true, _count: { select: { pieces: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function getProject(accountId: string, id: string) {
  return prisma.project.findFirst({
    where: { id, accountId },
    include: {
      brandProfile: true,
      shopify: true,
      runs: { orderBy: { createdAt: "desc" }, take: 5 },
      _count: { select: { pieces: true, pages: true } },
    },
  });
}

/** Throwing variant for callers that need the project guaranteed to exist. */
export async function requireProject(accountId: string, id: string) {
  const project = await getProject(accountId, id);
  if (!project) throw new NotFoundError("project not found");
  return project;
}

export interface CreateProjectInput {
  name: string;
  siteUrl: string;
}

/** Create a project and queue the crawl + brand-draft run (the ask-first flow). */
export async function createProject(accountId: string, input: CreateProjectInput) {
  const name = input.name.trim();
  const rawUrl = input.siteUrl.trim();
  if (!name || !rawUrl) throw new ServiceError("name and site URL required", 400);
  const siteUrl = normalizeSiteUrl(rawUrl);

  const project = await prisma.project.create({
    data: { accountId, name, siteUrl },
  });
  await prisma.run.create({
    data: {
      projectId: project.id,
      status: "QUEUED",
      log: [{ at: new Date().toISOString(), phase: "queued", message: "crawl + brand draft" }],
    },
  });
  return project;
}
