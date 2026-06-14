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
import { makeClient, MODELS } from "@/lib/engine";

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
  const r = await runCatalogRewrite({ projectId, runId: run.id, limit });
  revalidatePath(`/p/${await projectSlug(projectId)}`, "layout");
  return { done: r.done, flagged: r.flagged };
}
export type RunBatchResult = { done: number; flagged: number };

// BACKGROUND batch: start the run detached and return its id immediately, so the
// dashboard can show live progress, be closed, and reopened later. App Runner is
// a long-lived container, so the detached run completes after the response; all
// progress is tracked on the Run row (status/done/flagged/log), polled below.
export async function startBatch(projectId: string, limit = 2): Promise<{ runId: string }> {
  const account = await requireAccount();
  const project = await prisma.project.findFirst({ where: { id: projectId, accountId: account.id } });
  if (!project) throw new Error("NOT_FOUND");
  const lim = Math.min(5, Math.max(1, Number(limit) || 2));
  const run = await prisma.run.create({ data: { projectId, status: "QUEUED" } });
  // Detached: do NOT revalidate here (this continuation runs after the response,
  // outside request scope). The client polls getRunProgress and refreshes the
  // dashboard when the run reaches a terminal state.
  void runCatalogRewrite({ projectId, runId: run.id, limit: lim }).catch(async () => {
    await prisma.run.update({ where: { id: run.id }, data: { status: "FAILED", finishedAt: new Date() } }).catch(() => {});
  });
  return { runId: run.id };
}

export type RunLogEntry = { at: string; phase: string; message: string };
export type RunProgress = {
  status: string;
  done: number;
  flagged: number;
  total: number;
  finishedAt: string | null;
  log: RunLogEntry[];
};

/** Poll a run's live progress (status + counts + chain-of-thought log). */
export async function getRunProgress(projectId: string, runId: string): Promise<RunProgress | null> {
  const account = await requireAccount();
  const run = await prisma.run.findFirst({
    where: { id: runId, projectId, project: { accountId: account.id } },
  });
  if (!run) return null;
  return {
    status: run.status,
    done: run.done,
    flagged: run.flagged,
    total: run.total,
    finishedAt: run.finishedAt?.toISOString() ?? null,
    log: ((run.log as RunLogEntry[]) ?? []).filter((e) => e && e.message),
  };
}

/** The latest still-running batch for a project (lets the dashboard re-attach
 *  its progress panel after a close/refresh). */
export async function getActiveRun(projectId: string): Promise<{ runId: string } | null> {
  const account = await requireAccount();
  const run = await prisma.run.findFirst({
    where: { projectId, project: { accountId: account.id }, status: { in: ["QUEUED", "RUNNING"] } },
    orderBy: { createdAt: "desc" },
  });
  return run ? { runId: run.id } : null;
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

// ── First-run onboarding: intent -> content calendar ─────────────────────────
// The user picks what they want (create/edit articles, improve product content).
// If articles are in scope, Rankenstein proposes a calendar of article topics from
// the confirmed brand's seed topics and saves them as PLANNED articles (kind=ARTICLE,
// status=DRAFTING, brief.scheduledFor weekly). They become "Generate now" rows in the
// Articles tab. No facts are invented — these are topic ideas, grounded later at draft.

interface PlannedTopic {
  title: string;
  primaryKeyword: string;
  rationale?: string;
}

async function proposeArticleTopics(brand: { brandName: string; industry?: string | null; audience?: string | null; seedTopics: string[] }, count: number): Promise<PlannedTopic[]> {
  const client = makeClient();
  const sys =
    "You are an SEO content strategist. Propose blog article topics a store can realistically rank for. " +
    "Each topic must be specific and useful to the audience, with a long-tail primary keyword (buyer- or how-to-intent). " +
    "Never invent product facts. Return ONLY a JSON array, no prose.";
  const user = `Brand: ${brand.brandName}${brand.industry ? ` (${brand.industry})` : ""}.
Audience: ${brand.audience ?? "general shoppers"}.
Seed topics: ${brand.seedTopics.join(", ") || brand.industry || brand.brandName}.

Propose ${count} article topics. Return a JSON array of objects:
[{"title": "...", "primaryKeyword": "...", "rationale": "one short reason this wins"}]`;
  const msg = await client.messages.create({ model: MODELS.strong, max_tokens: 1500, system: sys, messages: [{ role: "user", content: user }] });
  const text = msg.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("\n");
  const json = text.slice(text.indexOf("["), text.lastIndexOf("]") + 1);
  const parsed = JSON.parse(json) as PlannedTopic[];
  return parsed.filter((t) => t?.title && t?.primaryKeyword).slice(0, count);
}

export async function planContentCalendar(formData: FormData) {
  const account = await requireAccount();
  const projectId = String(formData.get("projectId"));
  const goals = String(formData.get("goals") ?? "").split(",").filter(Boolean); // create_articles | edit_articles | improve_products
  const count = Math.min(12, Math.max(3, Number(formData.get("count") ?? 8)));

  const project = await prisma.project.findFirst({ where: { id: projectId, accountId: account.id }, include: { brandProfile: true, shopify: { select: { shopDomain: true } } } });
  if (!project) throw new Error("NOT_FOUND");
  const slug = deriveSlug(project);

  if (goals.includes("create_articles") && project.brandProfile?.confirmed) {
    const bp = project.brandProfile;
    const topics = await proposeArticleTopics({ brandName: bp.brandName ?? project.name, industry: bp.industry, audience: bp.audience, seedTopics: bp.seedTopics ?? [] }, count);

    // schedule weekly, starting next Monday
    const start = new Date();
    start.setHours(9, 0, 0, 0);
    const day = start.getDay();
    start.setDate(start.getDate() + ((8 - day) % 7 || 7));

    await prisma.$transaction(
      topics.map((t, i) => {
        const scheduledFor = new Date(start);
        scheduledFor.setDate(start.getDate() + i * 7);
        return prisma.contentItem.create({
          data: {
            projectId, kind: "ARTICLE", action: "CREATE", status: "DRAFTING",
            title: t.title, primaryKeyword: t.primaryKeyword,
            brief: { scheduledFor: scheduledFor.toISOString(), rationale: t.rationale ?? null, planned: true } as never,
          },
        });
      }),
    );
  }

  revalidatePath(`/p/${slug}`, "layout");
  // route to the calendar (articles) when planning, else products
  redirect(goals.includes("improve_products") && !goals.includes("create_articles") ? `/p/${slug}/products` : `/p/${slug}/articles`);
}

// Generate one PLANNED calendar article. The placeholder (DRAFTING) is removed first
// so the engine's dedup doesn't skip the topic, then runArticleBatch creates the real
// piece (PENDING_REVIEW) for that exact topic.
export async function generatePlannedArticle(formData: FormData) {
  const account = await requireAccount();
  const itemId = String(formData.get("itemId"));
  const item = await prisma.contentItem.findFirst({ where: { id: itemId, project: { accountId: account.id } } });
  if (!item) throw new Error("NOT_FOUND");
  const topic = item.primaryKeyword || item.title;
  if (!topic) throw new Error("planned item has no topic");

  await prisma.contentItem.delete({ where: { id: item.id } });
  const run = await prisma.run.create({ data: { projectId: item.projectId, status: "QUEUED" } });
  await runArticleBatch({ projectId: item.projectId, runId: run.id, topics: [topic], limit: 1 });
  revalidatePath(`/p/${await projectSlug(item.projectId)}`, "layout");
}

// Remove a planned calendar entry.
export async function removePlannedArticle(formData: FormData) {
  const account = await requireAccount();
  const itemId = String(formData.get("itemId"));
  const item = await prisma.contentItem.findFirst({ where: { id: itemId, status: "DRAFTING", project: { accountId: account.id } } });
  if (!item) throw new Error("NOT_FOUND");
  await prisma.contentItem.delete({ where: { id: item.id } });
  revalidatePath(`/p/${await projectSlug(item.projectId)}`, "layout");
}

// Generate a rewrite for ONE specific product (from the Products tab). Fetches that
// product's public JSON (same shape the engine grounds against) and runs the engine
// for it only. Clears a prior FAILED/DRAFTING attempt so retry works.
export type GenProductResult = { done: number; flagged: number; error?: string };
export async function generateProductRewrite(formData: FormData): Promise<GenProductResult> {
  const account = await requireAccount();
  const projectId = String(formData.get("projectId"));
  const handle = String(formData.get("handle"));
  const project = await prisma.project.findFirst({ where: { id: projectId, accountId: account.id } });
  if (!project) throw new Error("NOT_FOUND");

  await prisma.contentItem.deleteMany({
    where: { projectId, kind: "PRODUCT_REWRITE", sourceRef: handle, status: { in: ["FAILED", "DRAFTING"] } },
  });

  const base = project.siteUrl.replace(/\/$/, "");
  let product: unknown;
  try {
    const res = await fetch(`${base}/products/${handle}.json`, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return { done: 0, flagged: 0, error: `could not fetch product (${res.status})` };
    product = (await res.json()).product;
  } catch (e) {
    return { done: 0, flagged: 0, error: e instanceof Error ? e.message : "fetch failed" };
  }
  if (!product) return { done: 0, flagged: 0, error: "product not found on the storefront" };

  const run = await prisma.run.create({ data: { projectId, status: "QUEUED" } });
  const r = await runCatalogRewrite({ projectId, runId: run.id, rawProducts: [product], limit: 1 });
  revalidatePath(`/p/${await projectSlug(projectId)}`, "layout");
  return { done: r.done, flagged: r.flagged };
}

export async function ensureAccountForDev() {
  // convenience for local: nothing if already signed in
  return getAccount();
}
