import "dotenv/config";
import { prisma } from "../src/lib/db";
async function main(){const p=await prisma.brandProfile.findFirst({where:{project:{id:"cmqcpqrbn00029kj3eyotnqm9"}}});console.log((p?.brandFacts??"(none)").slice(0,500));}
main().finally(()=>prisma.$disconnect());
