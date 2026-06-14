import "dotenv/config";
import { prisma } from "../src/lib/db";
import { deriveSlug } from "../src/lib/slug";
async function main() {
  const ps = await prisma.project.findMany({
    include: { shopify: { select: { shopDomain: true } }, brandProfile: { select: { confirmed: true } },
      _count: { select: { pieces: true } }, account: { select: { email: true } } },
    orderBy: { createdAt: "asc" },
  });
  for (const p of ps) {
    console.log(`slug=${deriveSlug(p).padEnd(14)} name="${p.name}" site=${p.siteUrl} shop=${p.shopify?.shopDomain ?? "-"} pieces=${p._count.pieces} brand=${p.brandProfile?.confirmed ? "confirmed":"no"} acct=${p.account.email} id=${p.id}`);
  }
}
main().catch(e=>console.error(e.message)).finally(()=>prisma.$disconnect());
