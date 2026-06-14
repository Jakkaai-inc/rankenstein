import "dotenv/config";
import { prisma } from "../src/lib/db";

const KEEP = "cmqcpqrbn00029kj3eyotnqm9";   // canonical EZ Fabric (43 pieces)
const ACCOUNT_EMAIL = "gb@stop-scrolling.com";

async function main() {
  const acct = await prisma.account.findUnique({ where: { email: ACCOUNT_EMAIL } });
  if (!acct) throw new Error("account not found");

  const projects = await prisma.project.findMany({
    where: { accountId: acct.id },
    include: { _count: { select: { pieces: true } } },
  });

  const targets = projects.filter((p) => p.id !== KEEP && p._count.pieces === 0);
  console.log(`account ${ACCOUNT_EMAIL}: ${projects.length} projects; deleting ${targets.length} empty (keeping ${KEEP} + any with content)\n`);

  for (const p of targets) {
    // children first (FK-safe). Empty projects have 0 contentItems, so versions/comments are moot.
    await prisma.run.deleteMany({ where: { projectId: p.id } });
    await prisma.runConfig.deleteMany({ where: { projectId: p.id } });
    await prisma.keyword.deleteMany({ where: { projectId: p.id } });
    await prisma.page.deleteMany({ where: { projectId: p.id } });
    await prisma.shopifyConnection.deleteMany({ where: { projectId: p.id } });
    await prisma.brandProfile.deleteMany({ where: { projectId: p.id } });
    await prisma.project.delete({ where: { id: p.id } });
    console.log(`  deleted: "${p.name}" (${p.siteUrl}) ${p.id}`);
  }

  const remain = await prisma.project.findMany({ where: { accountId: acct.id }, include: { _count: { select: { pieces: true } } } });
  console.log(`\nremaining on ${ACCOUNT_EMAIL}:`);
  for (const p of remain) console.log(`  "${p.name}" pieces=${p._count.pieces} ${p.id}`);
}
main().catch((e) => { console.error("FAILED:", e.message); process.exit(1); }).finally(() => prisma.$disconnect());
