// Run orchestrator (Lane A) — the bridge from a dashboard run to Lane C's engine
// to the DB review queue. Priority-first over the catalog, per-piece token
// ceiling (enforced inside the engine via RunConfig), spend soft-stop, triage
// (a piece the verifier fails is flagged for human review, never auto-shipped).

import {
  runProductRewrite,
  runArticle,
  liveDeps,
  liveArticleDeps,
  normalizeProduct,
  buildCatalogIndex,
  DEFAULT_RUN_CONFIG,
  DEFAULT_ARTICLE_RUN_CONFIG,
} from "@/lib/engine";
import type { BrandProfile, RunConfig as EngineRunConfig } from "@/lib/engine/types";
import { prisma } from "@/lib/db";

// Rough per-piece cost estimate (strong rewrite + fast research/serp/verify) for
// the spend soft-stop. Real usage metering is a later upgrade.
const EST_USD_PER_PIECE = 0.12;

type DbBrand = {
  brandName: string;
  vendorName?: string | null;
  voice: string | null;
  brandFacts?: string | null;
  voiceHardRules: unknown;
  seedTopics: string[];
  confirmed: boolean;
};

export function toEngineBrand(db: DbBrand, primaryDomain: string): BrandProfile {
  const rules = (db.voiceHardRules ?? {}) as {
    bannedWords?: string[];
    trademarks?: { mark: string; owner: string; descriptiveUseTolerated?: boolean }[];
  };
  return {
    name: db.brandName,
    confirmed: db.confirmed,
    vendorName: db.vendorName ?? db.brandName,
    primaryDomain,
    trademarks: (rules.trademarks ?? []).map((t) => ({
      mark: t.mark,
      owner: t.owner,
      descriptiveUseTolerated: t.descriptiveUseTolerated ?? false,
    })),
    bannedWords: rules.bannedWords ?? [],
    // CRITICAL: the confirmed brand's seed topics drive research. Empty seeds
    // make the research provider hallucinate generic keywords (earbuds, shoes).
    seedTerms: db.seedTopics ?? [],
    voiceNote: db.voice ?? "One honest peer among competitors. Specificity persuades; never hard-sell.",
    brandFacts: db.brandFacts ?? undefined,
  };
}

/** Public Shopify endpoint — raw product JSON for grounding, no OAuth needed. */
export async function fetchPublicProducts(siteUrl: string, limit = 250): Promise<unknown[]> {
  const base = siteUrl.replace(/\/$/, "");
  const all: unknown[] = [];
  for (let page = 1; page <= Math.ceil(limit / 250); page++) {
    const res = await fetch(`${base}/products.json?limit=250&page=${page}`, {
      signal: AbortSignal.timeout(20_000),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; RankensteinBot/0.1)" },
    });
    if (!res.ok) break;
    const data = (await res.json()) as { products?: unknown[] };
    const batch = data.products ?? [];
    if (batch.length === 0) break;
    all.push(...batch);
    if (all.length >= limit) break;
  }
  return all.slice(0, limit);
}

function engineRunConfig(over?: Partial<EngineRunConfig>): EngineRunConfig {
  return { ...DEFAULT_RUN_CONFIG, ...over };
}

export interface RunBatchOptions {
  projectId: string;
  runId: string;
  limit?: number;
  rawProducts?: unknown[]; // injectable; else pulled from public products.json
  runConfig?: Partial<EngineRunConfig>;
}

/** Process a catalog batch. Each piece -> ContentItem (PENDING_REVIEW or flagged)
 *  + ContentVersion v1. Stops early on the spend soft-stop. */
export async function runCatalogRewrite(opts: RunBatchOptions): Promise<{ done: number; flagged: number; stopped: boolean }> {
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: opts.projectId },
    include: { brandProfile: true },
  });
  if (!project.brandProfile?.confirmed) throw new Error("brand profile must be confirmed before a run");

  const brand = toEngineBrand(project.brandProfile, project.siteUrl.replace(/^https?:\/\//, ""));
  const rc = engineRunConfig(opts.runConfig);
  const deps = liveDeps({ apiKey: process.env.ANTHROPIC_API_KEY });

  // Pull a wide pool for grounding + catalog index; the batch limit is applied
  // AFTER skipping already-processed products so run-steps advance.
  const raw = opts.rawProducts ?? (await fetchPublicProducts(project.siteUrl, 250));
  const normalized = raw.map((r) => normalizeProduct(r as Parameters<typeof normalizeProduct>[0]));
  const catalogIndex = buildCatalogIndex(normalized);

  // Dedup: skip products that already have a piece for this project.
  const doneRefs = new Set(
    (await prisma.contentItem.findMany({ where: { projectId: opts.projectId, sourceRef: { not: null } }, select: { sourceRef: true } }))
      .map((c) => c.sourceRef!),
  );
  const pending = normalized.filter((p) => !doneRefs.has(productRef(p)));

  // Priority: products with thin/missing/AI-artifact bodies first (most upside).
  const prioritized = [...pending]
    .sort((a, b) => scorePriority(b) - scorePriority(a))
    .slice(0, opts.limit ?? 25);

  await prisma.run.update({
    where: { id: opts.runId },
    data: { status: "RUNNING", total: prioritized.length, startedAt: new Date() },
  });
  await appendRunLog(opts.runId, "start", `Starting batch over ${prioritized.length} product(s). Each runs the full engine: research, SERP ownership, grounding, rewrite, AEO, guardrails, then an independent verifier.`);

  let done = 0;
  let flagged = 0;
  let spend = 0;
  const softStop = rc.runSpendSoftStopUsd ?? DEFAULT_RUN_CONFIG.runSpendSoftStopUsd;

  for (const product of prioritized) {
    if (spend + EST_USD_PER_PIECE > softStop) {
      await appendRunLog(opts.runId, "soft-stop", `spend ~$${spend.toFixed(2)} reached the $${softStop} ceiling; stopping`);
      await prisma.run.update({ where: { id: opts.runId }, data: { status: "PAUSED", spendUsd: spend } });
      return { done, flagged, stopped: true };
    }

    const pp = product as { title?: string; productType?: string };
    const title = pp.title ?? "product";
    try {
      // Product-aware seeds: the product's own name/type + a few brand seeds, so
      // research targets THIS product, not the same brand-level terms every time.
      const seedTerms = [pp.title, pp.productType, ...brand.seedTerms.slice(0, 3)]
        .filter((s): s is string => !!s && s.length > 2);
      await appendRunLog(opts.runId, "piece", `Working on: ${title}`);
      const res = await runProductRewrite({
        product, brand, catalogIndex, runConfig: rc, deps, seedTerms,
        // stream each engine layer into the run log as it completes (live chain-of-thought)
        onProgress: (s) => appendRunLog(opts.runId, "stage", `${s.layer}${s.note ? `: ${s.note}` : ""}`),
      });
      spend += EST_USD_PER_PIECE;
      const r = res.result;
      const isFlagged = res.haltReason != null || r.status === "flagged";
      if (isFlagged) flagged++;
      else done++;

      await persistPiece(opts.projectId, opts.runId, product, res);
      await prisma.run.update({
        where: { id: opts.runId },
        data: { done, flagged, spendUsd: spend },
      });
      await appendRunLog(
        opts.runId,
        "piece",
        isFlagged
          ? `${title}: flagged for review (verifier ${r.verdict?.verdict ?? "fail"}) - held back from the queue`
          : `${title}: ready for review (verifier ${r.verdict?.verdict ?? "pass"}${r.primaryKeyword ? `, primary "${r.primaryKeyword}"` : ""})`,
      );
    } catch (e) {
      flagged++;
      await appendRunLog(opts.runId, "error", `${(product as { title?: string }).title ?? "product"}: ${e instanceof Error ? e.message : e}`);
    }
  }

  await appendRunLog(opts.runId, "done", `Finished: ${done} ready for review, ${flagged} flagged.`);
  await prisma.run.update({
    where: { id: opts.runId },
    data: { status: "SUCCEEDED", done, flagged, spendUsd: spend, finishedAt: new Date() },
  });
  return { done, flagged, stopped: false };
}

// ── article batch ────────────────────────────────────────────────────────────

export interface ArticleBatchOptions {
  projectId: string;
  runId: string;
  limit?: number;
  topics?: string[]; // explicit topics; else discovered from the confirmed brand's seed topics
  rawProducts?: unknown[]; // injectable; else pulled from public products.json (catalog grounding + cannibalization firewall)
  runConfig?: Partial<EngineRunConfig>;
}

/**
 * Generate a batch of grounded ARTICLES into the review queue. Mirrors
 * runCatalogRewrite but drives Lane C's runArticle. Topic discovery: by default
 * the confirmed brand's seed topics ARE the per-article topics; the engine's
 * research -> serp-ownership -> select layers find the winnable keyword within
 * each. Dedup is by primaryKeyword (articles have no sourceRef until published),
 * so repeat clicks advance to fresh topics. Each result -> ContentItem
 * (kind=ARTICLE, PENDING_REVIEW or flagged) + ContentVersion v1.
 */
export async function runArticleBatch(opts: ArticleBatchOptions): Promise<{ done: number; flagged: number; stopped: boolean }> {
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: opts.projectId },
    include: { brandProfile: true },
  });
  if (!project.brandProfile?.confirmed) throw new Error("brand profile must be confirmed before a run");

  const brand = toEngineBrand(project.brandProfile, project.siteUrl.replace(/^https?:\/\//, ""));
  const rc = { ...DEFAULT_ARTICLE_RUN_CONFIG, ...opts.runConfig } as EngineRunConfig;
  const deps = liveArticleDeps({ apiKey: process.env.ANTHROPIC_API_KEY });

  // Catalog grounds the article (relatedProducts) and feeds the cannibalization
  // firewall; public products.json needs no OAuth.
  const raw = opts.rawProducts ?? (await fetchPublicProducts(project.siteUrl, 250));
  const normalized = raw.map((r) => normalizeProduct(r as Parameters<typeof normalizeProduct>[0]));
  const catalogIndex = buildCatalogIndex(normalized);

  // Topic source: explicit list, else the confirmed brand's seed topics.
  const allTopics = (opts.topics?.length ? opts.topics : brand.seedTerms)
    .map((t) => t.trim())
    .filter((t) => t.length > 2);

  // Dedup: skip topics whose keyword already produced an article for this project.
  // We compare case-insensitively against existing article primaryKeyword/title.
  const existing = await prisma.contentItem.findMany({
    where: { projectId: opts.projectId, kind: "ARTICLE" },
    select: { primaryKeyword: true, title: true },
  });
  const seen = new Set(
    existing.flatMap((c) => [c.primaryKeyword, c.title].filter(Boolean).map((s) => s!.toLowerCase())),
  );
  const pending = allTopics.filter((t) => !seen.has(t.toLowerCase()));
  const topics = pending.slice(0, opts.limit ?? 5);

  await prisma.run.update({
    where: { id: opts.runId },
    data: { status: "RUNNING", total: topics.length, startedAt: new Date() },
  });

  let done = 0;
  let flagged = 0;
  let spend = 0;
  const softStop = rc.runSpendSoftStopUsd ?? DEFAULT_RUN_CONFIG.runSpendSoftStopUsd;
  // Articles run more layers (angle/outline+critic/draft/citations) than a
  // product rewrite; budget a bit more per piece for the soft-stop.
  const estPerArticle = EST_USD_PER_PIECE * 3;

  for (const topic of topics) {
    if (spend + estPerArticle > softStop) {
      await appendRunLog(opts.runId, "soft-stop", `spend ~$${spend.toFixed(2)} reached the $${softStop} ceiling; stopping`);
      await prisma.run.update({ where: { id: opts.runId }, data: { status: "PAUSED", spendUsd: spend } });
      return { done, flagged, stopped: true };
    }

    try {
      const res = await runArticle({
        topic,
        brand,
        catalogIndex,
        runConfig: rc,
        deps,
        relatedProducts: normalized,
      });
      spend += estPerArticle;
      const isFlagged = res.haltReason != null || res.result.status === "flagged";
      if (isFlagged) flagged++;
      else done++;

      await persistResult(opts.projectId, opts.runId, res, {
        kind: "ARTICLE",
        action: "CREATE",
        sourceRef: null, // filled with the created article gid on first publish
        priority: 0,
      });
      await prisma.run.update({ where: { id: opts.runId }, data: { done, flagged, spendUsd: spend } });
    } catch (e) {
      flagged++;
      await appendRunLog(opts.runId, "error", `${topic}: ${e instanceof Error ? e.message : e}`);
    }
  }

  await prisma.run.update({
    where: { id: opts.runId },
    data: { status: "SUCCEEDED", done, flagged, spendUsd: spend, finishedAt: new Date() },
  });
  return { done, flagged, stopped: false };
}

function productRef(product: unknown): string {
  const p = product as { handle?: string; id?: number | string };
  return p.handle ?? String(p.id ?? "");
}

function scorePriority(product: unknown): number {
  const p = product as { bodyHtml?: string; body_html?: string; title?: string };
  const body = p.bodyHtml ?? p.body_html ?? "";
  let score = 0;
  if (/font-claude|response-body|data-start=/.test(body)) score += 100; // pasted AI artifacts
  if (body.replace(/<[^>]+>/g, "").trim().length < 200) score += 50; // thin
  return score;
}

async function persistPiece(
  projectId: string,
  runId: string,
  product: unknown,
  res: Awaited<ReturnType<typeof runProductRewrite>>,
) {
  await persistResult(projectId, runId, res, {
    kind: "PRODUCT_REWRITE",
    action: "REFRESH",
    sourceRef: productRef(product),
    priority: scorePriority(product),
  });
}

// Shared persistence for any engine result (product OR article). Article items
// carry no sourceRef at draft time — Lane B's publish path fills it with the
// created article gid on first push, so future publish/rollback target it.
async function persistResult(
  projectId: string,
  runId: string,
  res: Awaited<ReturnType<typeof runProductRewrite>>,
  meta: { kind: "PRODUCT_REWRITE" | "ARTICLE"; action: "CREATE" | "REFRESH"; sourceRef: string | null; priority: number },
) {
  const r = res.result;
  const status = res.haltReason != null || r.status === "flagged" ? "FAILED" : "PENDING_REVIEW";
  await prisma.contentItem.create({
    data: {
      projectId,
      runId,
      kind: meta.kind,
      action: meta.action,
      status: status as never,
      sourceRef: meta.sourceRef,
      priority: meta.priority,
      title: r.title,
      slug: r.slug,
      metaTitle: r.metaTitle,
      metaDescription: r.metaDescription,
      primaryKeyword: r.primaryKeyword,
      html: r.html,
      jsonld: r.jsonld as never,
      brief: r.brief as never,
      guardrailFlags: r.guardrailFlags as never,
      verifierVerdict: (res.verdict ?? null) as never,
      versions: {
        create: {
          version: 1,
          html: r.html,
          meta: { title: r.title, metaTitle: r.metaTitle, metaDescription: r.metaDescription, slug: r.slug },
          note: res.haltReason ? `flagged: ${res.haltReason}` : "draft v1",
        },
      },
    },
  });
}

async function appendRunLog(runId: string, phase: string, message: string) {
  const run = await prisma.run.findUniqueOrThrow({ where: { id: runId }, select: { log: true } });
  const log = (run.log as unknown[]) ?? [];
  await prisma.run.update({
    where: { id: runId },
    data: { log: [...log, { at: new Date().toISOString(), phase, message }] as never },
  });
}
