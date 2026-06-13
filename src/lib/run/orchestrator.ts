// Run orchestrator (Lane A) — the bridge from a dashboard run to Lane C's engine
// to the DB review queue. Priority-first over the catalog, per-piece token
// ceiling (enforced inside the engine via RunConfig), spend soft-stop, triage
// (a piece the verifier fails is flagged for human review, never auto-shipped).

import {
  runProductRewrite,
  liveDeps,
  normalizeProduct,
  buildCatalogIndex,
  DEFAULT_RUN_CONFIG,
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
  voiceHardRules: unknown;
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
    seedTerms: [],
    voiceNote: db.voice ?? "One honest peer among competitors. Specificity persuades; never hard-sell.",
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

    try {
      const res = await runProductRewrite({ product, brand, catalogIndex, runConfig: rc, deps });
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
    } catch (e) {
      flagged++;
      await appendRunLog(opts.runId, "error", `${(product as { title?: string }).title ?? "product"}: ${e instanceof Error ? e.message : e}`);
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
  const r = res.result;
  const p = product as { id?: number | string; handle?: string };
  const status = res.haltReason != null || r.status === "flagged" ? "FAILED" : "PENDING_REVIEW";
  await prisma.contentItem.create({
    data: {
      projectId,
      runId,
      kind: "PRODUCT_REWRITE",
      action: "REFRESH",
      status: status as never,
      sourceRef: productRef(product),
      priority: scorePriority(product),
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
