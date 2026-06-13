// JSON serializers — the stable wire contract the mobile client depends on.
// Keep these in sync with mobile/src/api/types.ts. Dates go out as ISO strings.

import type { Account } from "@prisma/client";

import type { getProject, listProjects } from "@/lib/services/projects";

type ProjectListRow = Awaited<ReturnType<typeof listProjects>>[number];
type ProjectDetailRow = NonNullable<Awaited<ReturnType<typeof getProject>>>;
type RunRow = ProjectDetailRow["runs"][number];
type BrandRow = NonNullable<ProjectDetailRow["brandProfile"]>;

export function publicAccount(a: Account) {
  return {
    id: a.id,
    email: a.email,
    name: a.name,
    kind: a.kind,
    credits: a.credits,
    createdAt: a.createdAt.toISOString(),
  };
}

export function projectListItem(p: ProjectListRow) {
  return {
    id: p.id,
    name: p.name,
    siteUrl: p.siteUrl,
    shopifyConnected: !!p.shopify,
    brandConfirmed: p.brandProfile?.confirmed ?? false,
    pieces: p._count.pieces,
    createdAt: p.createdAt.toISOString(),
  };
}

function brandPublic(b: BrandRow) {
  return {
    brandName: b.brandName,
    industry: b.industry,
    audience: b.audience,
    voice: b.voice,
    brandFacts: b.brandFacts,
    seedTopics: b.seedTopics,
    competitors: b.competitors,
    confirmed: b.confirmed,
    confirmedAt: b.confirmedAt?.toISOString() ?? null,
  };
}

function runSummary(r: RunRow) {
  return {
    id: r.id,
    status: r.status,
    total: r.total,
    done: r.done,
    flagged: r.flagged,
    spendUsd: r.spendUsd,
    createdAt: r.createdAt.toISOString(),
    startedAt: r.startedAt?.toISOString() ?? null,
    finishedAt: r.finishedAt?.toISOString() ?? null,
  };
}

export function projectDetail(p: ProjectDetailRow) {
  return {
    id: p.id,
    name: p.name,
    siteUrl: p.siteUrl,
    shopify: p.shopify
      ? { shopDomain: p.shopify.shopDomain, installedAt: p.shopify.installedAt.toISOString() }
      : null,
    brand: p.brandProfile ? brandPublic(p.brandProfile) : null,
    counts: { pieces: p._count.pieces, pages: p._count.pages },
    // the three-step onboarding gate, computed server-side so clients stay dumb
    gate: {
      shopifyConnected: !!p.shopify,
      brandConfirmed: p.brandProfile?.confirmed ?? false,
    },
    runs: p.runs.map(runSummary),
    createdAt: p.createdAt.toISOString(),
  };
}
