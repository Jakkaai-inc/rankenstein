import "dotenv/config";
import { prisma } from "../src/lib/db";
async function main() {
  const acct = await prisma.account.upsert({
    where: { email: "gb@stop-scrolling.com" },
    create: { email: "gb@stop-scrolling.com", name: "Gev Balyan", kind: "agency" },
    update: {},
  });
  console.log("account ok:", acct.id, acct.kind, "credits:", acct.credits);
  console.log("accounts in db:", await prisma.account.count());
}
main().catch(e => { console.error("DB ERROR:", e.message); process.exit(1); }).finally(() => prisma.$disconnect());
