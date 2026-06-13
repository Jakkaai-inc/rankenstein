// Seed the EZ Fabric project and run a live catalog rewrite batch into the
// review queue. Validates the full pipeline end-to-end against real products.
// Usage: npx tsx scripts/seed-and-run.ts [limit]

import "dotenv/config";

import { prisma } from "../src/lib/db";
import { draftBrandFromSite } from "../src/lib/brand";
import { runCatalogRewrite } from "../src/lib/run/orchestrator";

const LIMIT = Number(process.argv[2] ?? 5);
const EMAIL = "gb@stop-scrolling.com";
const SITE = "https://ezfabricinc.com";

async function main() {
  const account = await prisma.account.upsert({
    where: { email: EMAIL },
    create: { email: EMAIL, name: "Gev Balyan", kind: "agency" },
    update: {},
  });

  let project = await prisma.project.findFirst({ where: { accountId: account.id, siteUrl: SITE } });
  if (!project) {
    project = await prisma.project.create({
      data: { accountId: account.id, name: "EZ Fabric", siteUrl: SITE },
    });
    console.log("created project", project.id);
  } else {
    console.log("project exists", project.id);
  }

  let bp = await prisma.brandProfile.findUnique({ where: { projectId: project.id } });
  if (!bp?.confirmed) {
    console.log("drafting brand from site...");
    const { ok, draft, note } = await draftBrandFromSite(SITE);
    console.log("draft:", note);
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
      : { brandName: "EZ Fabric" };
    bp = await prisma.brandProfile.upsert({
      where: { projectId: project.id },
      create: { projectId: project.id, ...data, confirmed: true, confirmedAt: new Date() },
      update: { ...data, confirmed: true, confirmedAt: new Date() },
    });
    console.log("brand confirmed:", bp.brandName, "| seeds:", bp.seedTopics.join(", "));
  }

  const run = await prisma.run.create({ data: { projectId: project.id, status: "QUEUED" } });
  console.log(`\nrunning catalog rewrite, limit=${LIMIT}, run=${run.id}\n`);
  const result = await runCatalogRewrite({ projectId: project.id, runId: run.id, limit: LIMIT });
  console.log("\n=== RESULT ===", JSON.stringify(result, null, 2));

  const pieces = await prisma.contentItem.findMany({
    where: { runId: run.id },
    select: { title: true, status: true, primaryKeyword: true },
  });
  for (const p of pieces) console.log(`  [${p.status}] ${p.title} (kw: ${p.primaryKeyword})`);
  console.log(`\nReview at: https://rankenstein.app/projects/${project.id}/review`);
}

main().catch((e) => { console.error("FAILED:", e); process.exit(1); }).finally(() => prisma.$disconnect());
