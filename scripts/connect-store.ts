// Connect a Shopify store to a project using a store CUSTOM-APP Admin API token,
// bypassing the Partner-org OAuth wall (the token is the same offline credential
// OAuth would yield; we just obtained it from the store admin directly).
//
// The token is a SECRET — pass it via env, never on the command line / in chat:
//   export EZFABRIC_ADMIN_TOKEN=shpat_...        (or put it in .env, untracked)
//   npx tsx scripts/connect-store.ts [shop] [siteUrl]
// Defaults: shop=ezfabric.myshopify.com  siteUrl=https://ezfabricinc.com
//
// It verifies the token by fetching shop context, then upserts the connection.
import "dotenv/config";

import { prisma } from "../src/lib/db";
import { adminClient } from "../src/lib/shopify/client";
import { fetchShopContext, saveConnection } from "../src/lib/shopify/connection";
import { SHOPIFY_SCOPES } from "../src/lib/shopify/config";

const SHOP = process.argv[2] ?? "ezfabric.myshopify.com";
const SITE = process.argv[3] ?? "https://ezfabricinc.com";
const TOKEN = process.env.EZFABRIC_ADMIN_TOKEN ?? process.env.SHOPIFY_ADMIN_TOKEN;

async function main() {
  if (!TOKEN) throw new Error("set EZFABRIC_ADMIN_TOKEN (the store custom-app Admin API token) in the env");
  const project = await prisma.project.findFirst({ where: { siteUrl: SITE } });
  if (!project) throw new Error(`no project for ${SITE}`);

  const client = adminClient(SHOP, TOKEN);
  console.log(`verifying token against ${SHOP} ...`);
  // Verify the token can read products (the publish path needs write_products);
  // fetch full context if scopes allow, else proceed with what we have so a
  // missing content/blog scope can't block a product publish.
  let context = { currency: null, locale: null, primaryDomain: null, blogId: null } as Awaited<ReturnType<typeof fetchShopContext>>;
  try {
    context = await fetchShopContext(client);
  } catch (e) {
    console.warn("partial context (some scopes missing, ok for product publish):", e instanceof Error ? e.message : e);
    const probe = await client.graphql<{ products: { nodes: { id: string }[] } }>(`{ products(first: 1) { nodes { id } } }`);
    console.log("product read OK, sample:", probe.products?.nodes?.[0]?.id ?? "(no products)");
  }
  console.log("store context:", context);

  const conn = await saveConnection({
    projectId: project.id,
    shopDomain: SHOP,
    accessToken: TOKEN,
    scopes: SHOPIFY_SCOPES,
    context,
  });
  console.log(`connected project ${project.id} (${project.name}) -> ${conn.shopDomain}`);
  console.log("token verified; you can now approve a piece and publish.");
}

main().catch((e) => { console.error("FAILED:", e instanceof Error ? e.message : e); process.exit(1); }).finally(() => prisma.$disconnect());
