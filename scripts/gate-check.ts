import "dotenv/config";
import { prisma } from "../src/lib/db";
const BANNED = ['best-in-class','world-class','cutting-edge','revolutionary','game-changer','unparalleled','premium','luxurious','ultimate','amazing','incredible'];
async function main() {
  const items = await prisma.contentItem.findMany({
    where: { projectId: "cmqcpqrbn00029kj3eyotnqm9", title: { in: ["Malibu Snuggle - Earth Tones","Cora Whispy Snuggle"] } },
  });
  for (const it of items) {
    const html = it.html ?? ""; const mt = it.metaTitle ?? ""; const md = it.metaDescription ?? "";
    const emdash = (html.match(/—/g)||[]).length + (mt.match(/—/g)||[]).length + (md.match(/—/g)||[]).length;
    const banned = BANNED.filter(b => new RegExp(`\\b${b}\\b`,"i").test(html+" "+mt+" "+md));
    const h1 = (html.match(/<h1/gi)||[]).length;
    console.log(`${it.title}: status=${it.status}`);
    console.log(`  em-dashes=${emdash} | banned=${JSON.stringify(banned)} | h1count=${h1} | metaTitleLen=${mt.length} | metaDescLen=${md.length}`);
  }
}
main().catch(e=>console.error(e.message)).finally(()=>prisma.$disconnect());
