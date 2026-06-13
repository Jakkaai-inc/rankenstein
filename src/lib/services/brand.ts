// Brand service — draft (from the site crawl) and confirm (the ask-first gate
// that unlocks generation). Transport-agnostic: arrays in, no FormData here.

import { draftBrandFromSite } from "@/lib/brand";
import { prisma } from "@/lib/db";

import { requireProject } from "./projects";
import { ServiceError } from "./errors";

/** Crawl the site and upsert a brand draft. Refuse-and-flag: an unreadable site
 *  yields a manual-entry stub (brand name only), never an invented brand. */
export async function draftBrandForProject(accountId: string, projectId: string) {
  const project = await requireProject(accountId, projectId);
  const { ok, draft } = await draftBrandFromSite(project.siteUrl);
  const data = ok
    ? {
        brandName: draft.brandName!,
        industry: draft.industry ?? null,
        audience: draft.audience ?? null,
        voice: draft.voice ?? null,
        brandFacts: draft.brandFacts ?? null,
        seedTopics: draft.seedTopics ?? [],
        competitors: draft.competitors ?? [],
      }
    : { brandName: project.name }; // refuse-and-flag: stub for manual entry, no invention

  return prisma.brandProfile.upsert({
    where: { projectId },
    create: { projectId, ...data },
    update: data,
  });
}

export interface ConfirmBrandInput {
  brandName?: string;
  industry?: string;
  audience?: string;
  voice?: string;
  brandFacts?: string;
  seedTopics: string[];
  competitors?: string[];
}

/** Confirm the brand profile — the gate that unlocks generation. Requires at
 *  least one seed topic (research starts from these). */
export async function confirmBrand(accountId: string, projectId: string, input: ConfirmBrandInput) {
  await requireProject(accountId, projectId);

  const seedTopics = (input.seedTopics ?? []).map((s) => s.trim()).filter(Boolean);
  if (seedTopics.length === 0) {
    throw new ServiceError("add at least one seed topic — research starts from these", 400);
  }

  const data = {
    brandName: (input.brandName ?? "").trim() || "Unnamed brand",
    industry: (input.industry ?? "").trim() || null,
    audience: input.audience ?? "",
    voice: input.voice ?? "",
    brandFacts: input.brandFacts ?? "",
    seedTopics,
    competitors: (input.competitors ?? []).map((s) => s.trim()).filter(Boolean),
    confirmed: true,
    confirmedAt: new Date(),
  };

  return prisma.brandProfile.upsert({
    where: { projectId },
    create: { projectId, ...data },
    update: data,
  });
}
