"use server";

// Onboarding server actions. The wizard does create + crawl + confirm via the
// /api/v1 routes (so it can show progress + branch); this action handles the
// demo-day Shopify pre-connect, which needs server-only secrets.

import { revalidatePath } from "next/cache";

import { requireAccount } from "@/lib/session";
import { prisma } from "@/lib/db";
import { deriveSlug } from "@/lib/slug";
import { adminClient, fetchShopContext, saveConnection, normalizeShopDomain, SHOPIFY_SCOPES } from "@/lib/shopify";

export type PreconnectResult = {
  connected: boolean;
  shop: string | null;
  slug: string;
  note: string;
};

async function slugFor(projectId: string): Promise<string> {
  const p = await prisma.project.findUnique({
    where: { id: projectId },
    include: { shopify: { select: { shopDomain: true } } },
  });
  return p ? deriveSlug(p) : projectId;
}

/**
 * Demo-day pre-connect: Shopify's app-review flow blocks publishing to a live
 * customer store, so for the demo we attach a real store (configured via env)
 * to this project. Idempotent and best-effort: never throws into the wizard, so
 * the step always renders (with a manual-connect fallback when unconfigured).
 */
export async function preconnectDemoStore(projectId: string): Promise<PreconnectResult> {
  const account = await requireAccount();
  const project = await prisma.project.findFirst({
    where: { id: projectId, accountId: account.id },
    include: { shopify: { select: { shopDomain: true } } },
  });
  if (!project) throw new Error("NOT_FOUND");

  // Already connected (e.g. revisiting the step) -> report it, no re-connect.
  if (project.shopify?.shopDomain) {
    return { connected: true, shop: project.shopify.shopDomain, slug: deriveSlug(project), note: "Store already connected." };
  }

  const rawShop = process.env.RK_DEMO_SHOPIFY_DOMAIN;
  const token = process.env.RK_DEMO_SHOPIFY_TOKEN;
  const shop = normalizeShopDomain(rawShop);
  if (!shop || !token) {
    return {
      connected: false,
      shop: null,
      slug: await slugFor(projectId),
      note: "Demo store not configured (RK_DEMO_SHOPIFY_DOMAIN / RK_DEMO_SHOPIFY_TOKEN). Connect a store from Settings when ready.",
    };
  }

  try {
    const client = adminClient(shop, token);
    const context = await fetchShopContext(client); // verifies the token + store context
    await saveConnection({ projectId, shopDomain: shop, accessToken: token, scopes: SHOPIFY_SCOPES, context });
    const slug = await slugFor(projectId);
    revalidatePath(`/p/${slug}`, "layout");
    return { connected: true, shop, slug, note: "Demo store connected." };
  } catch (e) {
    return {
      connected: false,
      shop,
      slug: await slugFor(projectId),
      note: `Could not reach the demo store (${e instanceof Error ? e.message : "error"}). Connect manually from Settings.`,
    };
  }
}
