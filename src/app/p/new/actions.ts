"use server";

// Onboarding server actions. The wizard does create + crawl + confirm via the
// /api/v1 routes (so it can show progress + branch); this action handles the
// demo-day Shopify pre-connect, which needs server-only secrets.

import { revalidatePath } from "next/cache";

import { requireAccount } from "@/lib/session";
import { prisma } from "@/lib/db";
import { deriveSlug } from "@/lib/slug";
import { createProject as createProjectSvc } from "@/lib/services/projects";
import { draftBrandForProject, confirmBrand } from "@/lib/services/brand";
import { adminClient, fetchShopContext, saveConnection, normalizeShopDomain, SHOPIFY_SCOPES } from "@/lib/shopify";

// NOTE: the wizard calls these SERVER ACTIONS (cookie session) rather than the
// /api/v1 routes, which authenticate via a bearer token (mobile) and would 401
// a web fetch. Each action authenticates with requireAccount() (cookie).

export type BrandFields = {
  brandName: string;
  industry: string;
  audience: string;
  voice: string;
  brandFacts: string;
  seedTopics: string[];
  competitors: string[];
};

export type CreateAndDraftResult =
  | { ok: true; projectId: string; accessible: boolean; brand: BrandFields }
  | { ok: false; error: string };

function hostOf(url: string): string {
  try {
    return new URL(url.startsWith("http") ? url : `https://${url}`).hostname.replace(/^www\./, "");
  } catch {
    return url.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  }
}

/** Step 1: create the project + crawl the site for a brand draft (one crawl). */
export async function createAndDraft(siteUrl: string): Promise<CreateAndDraftResult> {
  try {
    const account = await requireAccount();
    const project = await createProjectSvc(account.id, { name: hostOf(siteUrl) || "New project", siteUrl });
    const bp = await draftBrandForProject(account.id, project.id);
    const brand: BrandFields = {
      brandName: bp.brandName ?? "",
      industry: bp.industry ?? "",
      audience: bp.audience ?? "",
      voice: bp.voice ?? "",
      brandFacts: bp.brandFacts ?? "",
      seedTopics: bp.seedTopics ?? [],
      competitors: bp.competitors ?? [],
    };
    const accessible = Boolean(brand.voice || brand.industry || brand.seedTopics.length);
    return { ok: true, projectId: project.id, accessible, brand };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not read the site" };
  }
}

export type ConfirmResult = { ok: true } | { ok: false; error: string };

/** Step 2: confirm the brand (the gate that unlocks generation). */
export async function confirmBrandStep(projectId: string, fields: BrandFields): Promise<ConfirmResult> {
  try {
    const account = await requireAccount();
    await confirmBrand(account.id, projectId, {
      brandName: fields.brandName,
      industry: fields.industry,
      audience: fields.audience,
      voice: fields.voice,
      brandFacts: fields.brandFacts,
      seedTopics: fields.seedTopics,
      competitors: fields.competitors,
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not confirm the brand" };
  }
}

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
