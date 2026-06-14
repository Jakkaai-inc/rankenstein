import "dotenv/config";
import { prisma } from "../src/lib/db";
async function main() {
  const groups = await prisma.contentItem.groupBy({ by: ["projectId"], _count: { _all: true } });
  console.log("total content items:", groups.reduce((s,g)=>s+g._count._all,0));
  for (const g of groups) {
    const p = await prisma.project.findUnique({ where: { id: g.projectId }, include: { account: { select: { email: true } }, shopify: { select: { shopDomain: true } } } });
    const byStatus = await prisma.contentItem.groupBy({ by: ["status"], where: { projectId: g.projectId }, _count: { _all: true } });
    console.log(`\nproject ${g.projectId} (${p?.name}, acct ${p?.account.email}, shop ${p?.shopify?.shopDomain ?? "-"}): ${g._count._all} pieces`);
    for (const s of byStatus) console.log(`   ${s.status}: ${s._count._all}`);
  }
}
main().catch(e=>console.error(e.message)).finally(()=>prisma.$disconnect());
