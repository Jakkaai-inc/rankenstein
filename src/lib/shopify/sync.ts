// Catalog sync (Lane B). Pulls the store's products and blog articles via the
// Admin GraphQL API and upserts them as Page rows (the firewall/registry state
// the engine and review queue map against). Idempotent: re-running updates
// existing rows by (projectId, url) rather than duplicating.

import { prisma } from "@/lib/db";

import { type AdminClient } from "./client";
import { requireAdminClient } from "./connection";

interface ProductNode {
  id: string;
  handle: string;
  title: string;
  onlineStoreUrl: string | null;
}

interface ArticleNode {
  id: string;
  handle: string;
  title: string;
  blog: { handle: string } | null;
}

function originFor(domain: string | null): string {
  return domain ? `https://${domain}` : "";
}

async function fetchAllProducts(client: AdminClient): Promise<ProductNode[]> {
  const out: ProductNode[] = [];
  let cursor: string | null = null;
  // hard cap of 10 pages (1000 products) to bound a single sync call.
  for (let page = 0; page < 10; page++) {
    const data: {
      products: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: ProductNode[] };
    } = await client.graphql(
      `query($cursor: String) {
        products(first: 100, after: $cursor) {
          pageInfo { hasNextPage endCursor }
          nodes { id handle title onlineStoreUrl }
        }
      }`,
      { cursor },
    );
    out.push(...data.products.nodes);
    if (!data.products.pageInfo.hasNextPage) break;
    cursor = data.products.pageInfo.endCursor;
  }
  return out;
}

async function fetchArticles(client: AdminClient): Promise<ArticleNode[]> {
  try {
    const data = await client.graphql<{ articles: { nodes: ArticleNode[] } }>(
      `{ articles(first: 100) { nodes { id handle title blog { handle } } } }`,
    );
    return data.articles?.nodes ?? [];
  } catch {
    // articles read scope/availability varies; products are the demo path.
    return [];
  }
}

export interface SyncResult {
  products: number;
  articles: number;
  total: number;
}

/** Sync products + blog articles into Page rows for a connected project. */
export async function syncCatalog(projectId: string): Promise<SyncResult> {
  const { client, connection } = await requireAdminClient(projectId);
  const origin = originFor(connection.primaryDomain ?? connection.shopDomain);

  const [products, articles] = await Promise.all([fetchAllProducts(client), fetchArticles(client)]);

  for (const p of products) {
    const url = p.onlineStoreUrl ?? `${origin}/products/${p.handle}`;
    await prisma.page.upsert({
      where: { projectId_url: { projectId, url } },
      create: { projectId, type: "PRODUCT", url, title: p.title, externalId: p.id, handle: p.handle },
      update: { type: "PRODUCT", title: p.title, externalId: p.id, handle: p.handle },
    });
  }

  for (const a of articles) {
    const blogHandle = a.blog?.handle ?? "blogs";
    const url = `${origin}/blogs/${blogHandle}/${a.handle}`;
    await prisma.page.upsert({
      where: { projectId_url: { projectId, url } },
      create: { projectId, type: "BLOG", url, title: a.title, externalId: a.id, handle: a.handle },
      update: { type: "BLOG", title: a.title, externalId: a.id, handle: a.handle },
    });
  }

  return { products: products.length, articles: articles.length, total: products.length + articles.length };
}
