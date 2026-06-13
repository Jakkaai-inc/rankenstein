"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getAccount, requireAccount, signIn, signOut } from "@/lib/session";
import { confirmBrand, draftBrandForProject } from "@/lib/services/brand";
import { createProject as createProjectSvc } from "@/lib/services/projects";
import { adminClient, fetchShopContext, saveConnection, normalizeShopDomain, SHOPIFY_SCOPES } from "@/lib/shopify";
import { prisma } from "@/lib/db";
import { runCatalogRewrite, runArticleBatch } from "@/lib/run/orchestrator";
import { deriveSlug } from "@/lib/slug";

// Server actions are thin FormData adapters over the shared service layer
// (src/lib/services/*). The same services back the /api/v1 routes the mobile
// app calls, so web and mobile never drift.

// Resolve a project to its URL slug (for redirect/revalidate to /p/[slug]/…).
async function projectSlug(projectId: string): Promise<string> {
  const p = await prisma.project.findUnique({ where: { id: projectId }, include: { shopify: { select: { shopDomain: true } } } });
  return p ? deriveSlug(p) : projectId;
}

export async function signInAction(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const name = String(formData.get("name") ?? "").trim() || undefined;
  if (!email) throw new Error("email required");
  await signIn(email, name);
  redirect("/p");
}

export async function signOutAction() {
  await signOut();
  redirect("/login");
}

export async function createProject(formData: FormData) {
  const account = await requireAccount();
  const project = await createProjectSvc(account.id, {
    name: String(formData.get("name") ?? ""),
    siteUrl: String(formData.get("siteUrl") ?? ""),
  });
  redirect(`/p/${deriveSlug(project)}/overview`);
}

export async function draftBrand(formData: FormData) {
  const account = await requireAccount();
  const projectId = String(formData.get("projectId"));
  await draftBrandForProject(account.id, projectId);
  revalidatePath(`/p/${await projectSlug(projectId)}`, "layout");
}

export async function confirmBrandProfile(formData: FormData) {
  const account = await requireAccount();
  const projectId = String(formData.get("projectId"));
  await confirmBrand(account.id, projectId, {
    brandName: String(formData.get("brandName") ?? ""),
    industry: String(formData.get("industry") ?? ""),
    audience: String(formData.get("audience") ?? ""),
    voice: String(formData.get("voice") ?? ""),
    brandFacts: String(formData.get("brandFacts") ?? ""),
    seedTopics: String(formData.get("seedTopics") ?? "").split(","),
    competitors: String(formData.get("competitors") ?? "").split(","),
  });
  revalidatePath(`/p/${await projectSlug(projectId)}`, "layout");
}

// Generate a small grounded batch into the review queue. Synchronous (small
// limit) so the customer sees pieces land; the orchestrator skips already-done
// products via sourceRef, so repeat clicks advance the catalog.
export async function runBatch(formData: FormData) {
  const account = await requireAccount();
  const projectId = String(formData.get("projectId"));
  const limit = Math.min(3, Math.max(1, Number(formData.get("limit") ?? 2)));
  const project = await prisma.project.findFirst({ where: { id: projectId, accountId: account.id } });
  if (!project) throw new Error("NOT_FOUND");
  const run = await prisma.run.create({ data: { projectId, status: "QUEUED" } });
  await runCatalogRewrite({ projectId, runId: run.id, limit });
  revalidatePath(`/p/${await projectSlug(projectId)}`, "layout");
}

// Generate a batch of ARTICLES into the review queue. Topics are discovered
// from the confirmed brand's seed topics (the engine finds the winnable keyword
// within each). Repeat clicks advance to fresh topics (dedup by keyword/title).
export async function runArticles(formData: FormData) {
  const account = await requireAccount();
  const projectId = String(formData.get("projectId"));
  const limit = Math.min(3, Math.max(1, Number(formData.get("limit") ?? 2)));
  const project = await prisma.project.findFirst({ where: { id: projectId, accountId: account.id } });
  if (!project) throw new Error("NOT_FOUND");
  const run = await prisma.run.create({ data: { projectId, status: "QUEUED" } });
  await runArticleBatch({ projectId, runId: run.id, limit });
  revalidatePath(`/p/${await projectSlug(projectId)}`, "layout");
}

// Connect a Shopify store using a store CUSTOM-APP Admin API token, in-UI.
// This is the same proven path as scripts/connect-store.ts: verify the token by
// fetching shop context, then upsert the connection. Bypasses the Partner-org
// OAuth callback (useful when OAuth isn't wired for a given store). The token is
// a secret — it is read from the form, used to fetch context + saved, and never
// echoed back. Returns to Settings on success.
export async function connectStoreWithToken(formData: FormData) {
  const account = await requireAccount();
  const projectId = String(formData.get("projectId"));
  const rawShop = String(formData.get("shop") ?? "");
  const token = String(formData.get("token") ?? "").trim();

  const project = await prisma.project.findFirst({ where: { id: projectId, accountId: account.id } });
  if (!project) throw new Error("NOT_FOUND");
  const shop = normalizeShopDomain(rawShop);
  if (!shop) throw new Error("invalid store domain (expected your-store.myshopify.com)");
  if (!token.startsWith("shpat_")) throw new Error("expected a store Admin API access token (shpat_...)");

  const client = adminClient(shop, token);
  // Verify the token + fetch store context (currency/locale/domain/blogId). The
  // blogId is what the article publish path targets — best-effort per field so a
  // missing optional scope can't block the connect.
  const context = await fetchShopContext(client);
  await saveConnection({ projectId, shopDomain: shop, accessToken: token, scopes: SHOPIFY_SCOPES, context });
  const slug = await projectSlug(projectId);
  revalidatePath(`/p/${slug}`, "layout");
  redirect(`/p/${slug}/settings`);
}

export async function ensureAccountForDev() {
  // convenience for local: nothing if already signed in
  return getAccount();
}
