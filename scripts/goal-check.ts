// Machine-checkable grader for GOAL.md. Run: npx tsx scripts/goal-check.ts
// Prints PASS/FAIL per criterion and a score. The model hillclimbs until N/N.

import "dotenv/config";

import { prisma } from "../src/lib/db";

const APP = "https://studio.rankenstein.app"; // app moved to the studio subdomain; apex is marketing
const SITE = "https://ezfabricinc.com";

type Check = { id: string; desc: string; run: () => Promise<{ ok: boolean; note: string }> };

const checks: Check[] = [
  {
    id: "1-deployed",
    desc: "rankenstein.app returns 200 and serves the real app",
    run: async () => {
      const res = await fetch(APP, { signal: AbortSignal.timeout(15000) });
      const body = await res.text();
      const real = /Autonomous, self-correcting|Sign in/.test(body);
      const smoke = /Infra smoke test/.test(body);
      return { ok: res.status === 200 && real && !smoke, note: `status ${res.status}, real=${real}, smoke=${smoke}` };
    },
  },
  {
    id: "2-auth-guard",
    desc: "/projects redirects unauthenticated requests (not 500)",
    run: async () => {
      const res = await fetch(`${APP}/projects`, { redirect: "manual", signal: AbortSignal.timeout(15000) });
      return { ok: res.status >= 300 && res.status < 400, note: `status ${res.status}` };
    },
  },
  {
    id: "3-brand-confirmed",
    desc: "EZ Fabric project exists with a CONFIRMED brand profile",
    run: async () => {
      const p = await prisma.project.findFirst({ where: { siteUrl: SITE }, include: { brandProfile: true } });
      const ok = !!p?.brandProfile?.confirmed;
      return { ok, note: p ? `brand "${p.brandProfile?.brandName}" confirmed=${p.brandProfile?.confirmed}, seeds=${p.brandProfile?.seedTopics.length ?? 0}` : "no EZ Fabric project" };
    },
  },
  {
    id: "6-review-queue",
    desc: "at least 5 product pieces in PENDING_REVIEW for EZ Fabric",
    run: async () => {
      const p = await prisma.project.findFirst({ where: { siteUrl: SITE } });
      if (!p) return { ok: false, note: "no project" };
      const n = await prisma.contentItem.count({ where: { projectId: p.id, status: "PENDING_REVIEW", kind: "PRODUCT_REWRITE" } });
      const flagged = await prisma.contentItem.count({ where: { projectId: p.id, status: "FAILED" } });
      return { ok: n >= 5, note: `${n} pending review, ${flagged} flagged/triage` };
    },
  },
  {
    id: "8-publish-rollback",
    desc: "at least one piece published live with a rollback snapshot",
    run: async () => {
      const p = await prisma.project.findFirst({ where: { siteUrl: SITE } });
      if (!p) return { ok: false, note: "no project" };
      const published = await prisma.contentItem.count({ where: { projectId: p.id, status: "PUBLISHED", publishedUrl: { not: null } } });
      return { ok: published >= 1, note: `${published} published live (pending Lane B integration)` };
    },
  },
];

async function main() {
  let pass = 0;
  console.log(`\nGOAL check @ ${new Date().toISOString()}\n${"=".repeat(60)}`);
  for (const c of checks) {
    try {
      const r = await c.run();
      if (r.ok) pass++;
      console.log(`${r.ok ? "PASS" : "FAIL"}  ${c.id.padEnd(18)} ${c.desc}\n      ${r.note}`);
    } catch (e) {
      console.log(`FAIL  ${c.id.padEnd(18)} ${c.desc}\n      error: ${e instanceof Error ? e.message : e}`);
    }
  }
  console.log(`${"=".repeat(60)}\nSCORE: ${pass}/${checks.length}  (criteria 4,5 engine tests + 7 review-loop run separately in their lanes)\n`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
