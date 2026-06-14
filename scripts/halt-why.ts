import "dotenv/config";
import { prisma } from "../src/lib/db";
async function main() {
  const items = await prisma.contentItem.findMany({
    where: { projectId: "cmqcpqrbn00029kj3eyotnqm9", status: "FAILED", title: { in: ["Malibu Snuggle - Earth Tones", "Cora Whispy Snuggle"] } },
  });
  for (const it of items) {
    const b = it.brief as any; const v = it.verifierVerdict as any;
    console.log(`${it.title}: verdict=${v?.verdict} | html len=${(it.html??"").length}`);
    console.log(`  brief.remainingViolations/halt: ${JSON.stringify(b?.haltReason ?? b?.remainingViolations ?? b?.note ?? "(none in brief)")}`);
  }
}
main().catch(e=>console.error(e.message)).finally(()=>prisma.$disconnect());
