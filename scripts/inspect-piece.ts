import "dotenv/config";
import { prisma } from "../src/lib/db";
async function main() {
  const it = await prisma.contentItem.findFirst({
    where: { status: "FAILED", kind: "ARTICLE" },
    include: { versions: { select: { version: true } }, _count: { select: { versions: true, comments: true } } },
    orderBy: { createdAt: "desc" },
  });
  if (!it) return console.log("no failed article");
  console.log("title:", it.title);
  console.log("status:", it.status, "| kind:", it.kind);
  console.log("html null?:", it.html == null, "| len:", (it.html ?? "").length);
  console.log("versions:", it._count.versions, it.versions.map(v=>v.version));
  console.log("brief null?:", it.brief == null, "| verdict null?:", it.verifierVerdict == null);
}
main().catch(e=>console.error(e.message)).finally(()=>prisma.$disconnect());
