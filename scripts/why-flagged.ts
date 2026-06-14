import "dotenv/config";
import { prisma } from "../src/lib/db";
async function main() {
  const items = await prisma.contentItem.findMany({
    where: { projectId: "cmqcpqrbn00029kj3eyotnqm9", status: "FAILED" },
    orderBy: { createdAt: "desc" },
  });
  console.log(`${items.length} flagged/failed pieces\n`);
  const reasonTally: Record<string, number> = {};
  for (const it of items) {
    const v = it.verifierVerdict as any;
    const flags = (it.guardrailFlags as any[]) ?? [];
    const failedGates = v?.perGate ? Object.entries(v.perGate).filter(([,g]:any)=>!g.pass).map(([k]) => k) : [];
    const ungrounded = (v?.claimTrace ?? []).filter((c:any)=>!c.grounded).map((c:any)=>c.claim);
    const badFlags = flags.filter((f:any)=>f.severity==="BAD").map((f:any)=>`${f.type}`);
    console.log(`[${it.kind}] ${it.title}`);
    console.log(`   verdict=${v?.verdict ?? "?"} mode=${v?.mode ?? "?"}`);
    if (failedGates.length) console.log(`   failed gates: ${failedGates.join(", ")}`);
    if (badFlags.length) console.log(`   BAD flags: ${badFlags.join(", ")}`);
    if (ungrounded.length) console.log(`   ungrounded claims (${ungrounded.length}): ${JSON.stringify(ungrounded.slice(0,2))}`);
    console.log();
    for (const g of failedGates) reasonTally[`gate:${g}`] = (reasonTally[`gate:${g}`]??0)+1;
    for (const f of badFlags) reasonTally[`flag:${f}`] = (reasonTally[`flag:${f}`]??0)+1;
    if (ungrounded.length) reasonTally["ungrounded-claims"] = (reasonTally["ungrounded-claims"]??0)+1;
  }
  console.log("=== TALLY ==="); console.log(JSON.stringify(reasonTally, null, 2));
}
main().catch(e=>console.error(e.message)).finally(()=>prisma.$disconnect());
