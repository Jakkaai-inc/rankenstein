import "dotenv/config";
import { prisma } from "../src/lib/db";
async function main() {
  const p = await prisma.project.findFirst({ where: { siteUrl: "https://ezfabricinc.com" } });
  if (!p) return console.log("no project");
  await prisma.contentVersion.deleteMany({ where: { contentItem: { projectId: p.id } } });
  await prisma.comment.deleteMany({ where: { contentItem: { projectId: p.id } } });
  const d = await prisma.contentItem.deleteMany({ where: { projectId: p.id } });
  await prisma.run.deleteMany({ where: { projectId: p.id } });
  console.log(`cleared ${d.count} pieces + runs for ${p.name}`);
}
main().catch((e) => console.error(e.message)).finally(() => prisma.$disconnect());
