"use server";

// Fetch a single product's CURRENT live content from the store, for the Products
// drawer's "original content" panel. Ownership-checked; uses the project's stored
// connection (read_products).

import { prisma } from "@/lib/db";
import { getAccount } from "@/lib/session";
import { requireAdminClient } from "@/lib/shopify";

export interface OriginalProduct {
  ok: boolean;
  title?: string;
  descriptionHtml?: string;
  onlineStoreUrl?: string | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
  error?: string;
}

export async function getOriginalProduct(projectId: string, handle: string): Promise<OriginalProduct> {
  const account = await getAccount();
  if (!account) return { ok: false, error: "unauthenticated" };
  const project = await prisma.project.findFirst({ where: { id: projectId, accountId: account.id }, select: { id: true } });
  if (!project) return { ok: false, error: "not found" };

  try {
    const { client } = await requireAdminClient(projectId);
    const d = await client.graphql<{
      productByHandle: { title: string; descriptionHtml: string; onlineStoreUrl: string | null; seo: { title: string | null; description: string | null } } | null;
    }>(
      `query($h:String!){ productByHandle(handle:$h){ title descriptionHtml onlineStoreUrl seo { title description } } }`,
      { h: handle },
    );
    const p = d.productByHandle;
    if (!p) return { ok: false, error: "product not found in store" };
    return {
      ok: true,
      title: p.title,
      descriptionHtml: p.descriptionHtml ?? "",
      onlineStoreUrl: p.onlineStoreUrl,
      seoTitle: p.seo?.title ?? null,
      seoDescription: p.seo?.description ?? null,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
