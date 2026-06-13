// One-off: sync the connected store's catalog into Page rows (Products section data).
import "dotenv/config";
import { prisma } from "../src/lib/db";
import { syncCatalog } from "../src/lib/shopify";
async function main(){
  const p = await prisma.project.findFirst({ where:{ siteUrl:"https://ezfabricinc.com" }});
  if(!p) throw new Error("no project");
  console.log("syncing catalog for", p.id, "...");
  const r = await syncCatalog(p.id);
  console.log("sync result:", r);
  const byType = await prisma.page.groupBy({ by:["type"], where:{ projectId:p.id }, _count:true });
  console.log("pages now:", byType.map(t=>`${t.type}=${t._count}`).join(" "));
}
main().catch(e=>{console.error("FAILED:", e instanceof Error?e.message:e); process.exit(1);}).finally(()=>prisma.$disconnect());
