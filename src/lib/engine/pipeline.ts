// Per-piece product-rewrite workflow orchestrator.
//
// Shape: a dynamic workflow of typed layers. Deterministic logic (ground, filter,
// select, gates, the grounding math) is plain code; judgment layers (research,
// serp, rewrite, verify) are injected providers so the same orchestrator runs
// offline (fixtures + deterministic grader) or live (agents / Ahrefs).
//
// Hard rules enforced here:
//   - ground HARD STOPs if the brand profile is unconfirmed (no degraded mode).
//   - guardrails BAD flags block (refuse-and-flag).
//   - gates get one repair round; remaining violations block.
//   - verify is the gate to completion. In automated runs it MUST be an
//     independent context; a self-check verdict can never mark a piece done.
//   - two verify failures => the piece self-flags for human triage.

import type {
  CatalogIndex,
} from './catalog';
import type {
  AngleSet,
  Angle,
  BrandProfile,
  Citation,
  CitationVerdict,
  EngineVerdict,
  GateViolation,
  GroundResult,
  GuardrailFlag,
  AeoFinding,
  NormalizedProduct,
  Outline,
  PieceDraft,
  PieceResult,
  Registry,
  RunConfig,
  Selection,
  SiteAuthority,
  StoreContext,
  VariantKeywordMap,
} from './types';
import type {
  ResearchProvider,
  SerpProvider,
  Rewriter,
  Verifier,
  RewriteInput,
  AngleProvider,
  OutlineProvider,
  OutlineCritic,
  ArticleDrafter,
  ArticleSource,
  CitationChecker,
  ArticleVerifier,
} from './providers';
import { groundProduct, groundArticle, BrandUnconfirmedError, type ArticleGroundResult } from './layers/ground';
import { validateResearch } from './layers/research';
import { filterKeywords, EZ_FABRIC_FILTER_CONFIG, type FilterConfig } from './layers/filter';
import { selectKeywords } from './layers/select';
import { validateAngle } from './layers/angle';
import { runOutlineLoop } from './layers/outline';
import { verifyCitations, citationsBlocking, failedCitations } from './layers/citation-verify';
import { aeoCheck, aeoBlockingFailures } from './layers/aeo';
import { guardrails, hasBlockingFlag } from './layers/guardrails';
import { runGates } from './layers/gates';
import { fillImages, type ImageGenProvider, type ImageStore } from './layers/image-gen';
import { wordCount } from './html';
import {
  toContractBrief,
  toContractVerdict,
  toContractViolations,
} from './adapters';

export type StageLog = { layer: string; ok: boolean; note: string };

/** Engine superset return: the contract PieceResult plus engine-private extras
 *  the contracts have no field for yet (variant map, gaps, AEO, selection). */
export type EngineRunResult = {
  result: PieceResult; // canonical, contract-conformant
  ground: GroundResult;
  selection: Selection | null;
  variantMap: VariantKeywordMap[];
  gaps: string[];
  aeo: AeoFinding[];
  verdict: EngineVerdict | null;
  guardrailFlags: GuardrailFlag[];
  gateViolations: GateViolation[];
  haltReason?: string;
  log: StageLog[];
  // article-only extras (null/empty for product runs)
  angle?: AngleSet | null;
  outline?: Outline | null;
  citations?: CitationVerdict[];
};

export type RunDeps = {
  research: ResearchProvider;
  serp: SerpProvider;
  rewriter: Rewriter;
  verifier: Verifier;
};

export type RunOptions = {
  product: NormalizedProduct;
  brand: BrandProfile;
  catalogIndex: CatalogIndex;
  runConfig: RunConfig;
  deps: RunDeps;
  registry?: Registry;
  store?: Partial<StoreContext>;
  authority?: SiteAuthority;
  filterConfig?: FilterConfig;
  seedTerms?: string[];
  /** fires after each layer completes, for live progress streaming. */
  onProgress?: (stage: StageLog) => void | Promise<void>;
};

function depthToWindow(depth: RunConfig['depth']): { min: number; max: number } {
  // Product body target per RUBRIC A6 is 250-500; depth nudges the window.
  if (depth === 'brief') return { min: 180, max: 320 };
  if (depth === 'deep') return { min: 400, max: 700 };
  return { min: 250, max: 500 };
}

function hardStopResult(product: NormalizedProduct, reason: string, log: StageLog[], ground: GroundResult | null): EngineRunResult {
  const result: PieceResult = {
    kind: 'product',
    title: product.title,
    slug: '',
    metaTitle: '',
    metaDescription: '',
    primaryKeyword: '',
    html: '',
    jsonld: {},
    images: [],
    brief: {
      primaryKeyword: { keyword: '', volume: null, kd: null },
      secondaryKeywords: [],
      keywordDataSource: 'web-estimate',
      serpOwnershipNote: '',
      wordTarget: 0,
      wordCount: 0,
      historyDecision: 'net-new',
      exclusions: [],
    },
    guardrailFlags: ground ? ground.provenanceFlags : [],
    violations: [],
    verdict: { verdict: 'fail', isSelfCheck: false, perGate: {}, claimTrace: [], failures: [reason] },
    status: 'flagged',
  };
  return {
    result,
    ground: ground ?? ({} as GroundResult),
    selection: null,
    variantMap: [],
    gaps: ground ? ground.gaps.map((g) => `${g.field}: ${g.note}`) : [],
    aeo: [],
    verdict: null,
    guardrailFlags: ground ? ground.provenanceFlags : [],
    gateViolations: [],
    haltReason: reason,
    log,
  };
}

export async function runProductRewrite(opts: RunOptions): Promise<EngineRunResult> {
  const { product, brand, catalogIndex, runConfig, deps } = opts;
  const log: StageLog[] = [];
  // record a stage AND stream it live (onProgress failures never break the run).
  const emit = async (s: StageLog) => { log[log.length] = s; try { await opts.onProgress?.(s); } catch { /* progress is best-effort */ } };
  const country = 'US';

  // ── ground (HARD STOP on unconfirmed brand) ───────────────────────────────
  let ground: GroundResult;
  try {
    ground = groundProduct({ product, brand, store: opts.store, authority: opts.authority });
  } catch (e) {
    if (e instanceof BrandUnconfirmedError) {
      await emit({ layer: 'ground', ok: false, note: e.message });
      return hardStopResult(product, e.message, log, null);
    }
    throw e;
  }
  await emit({ layer: 'ground', ok: true, note: `${ground.facts.length} facts, ${ground.gaps.length} gaps, ${ground.provenanceFlags.length} provenance flags` });

  // ── research ──────────────────────────────────────────────────────────────
  const seedTerms = opts.seedTerms ?? brand.seedTerms;
  const candidates = await deps.research.keywords(seedTerms, country);
  validateResearch(candidates);
  await emit({ layer: 'research', ok: true, note: `${candidates.length} raw candidates` });

  // ── filter (deterministic) ────────────────────────────────────────────────
  const filtered = filterKeywords(candidates, catalogIndex, product, opts.filterConfig ?? EZ_FABRIC_FILTER_CONFIG);
  await emit({ layer: 'filter', ok: true, note: `${filtered.kept.length} kept, ${filtered.dropped.length} dropped/routed` });

  // ── serp-ownership (top N) ────────────────────────────────────────────────
  const topN = Math.min(runConfig.depth === 'deep' ? 16 : 12, filtered.kept.length);
  const shortlist = filtered.kept.slice(0, topN);
  const serp = await deps.serp.ownership(shortlist, ground.authority);
  await emit({ layer: 'serp-ownership', ok: true, note: `${serp.length} verdicts` });

  // ── select (deterministic firewall + roles + variant map) ─────────────────
  let selection: Selection;
  try {
    selection = selectKeywords(filtered, serp, product, opts.registry);
  } catch (e) {
    // e.g. no product-defining keyword survived filtering/firewall. Self-flag for
    // human triage rather than crashing the run or shipping an untargeted page.
    const reason =
      (e instanceof Error ? e.message : 'keyword selection failed') +
      ' - needs human review or different seed terms.';
    await emit({ layer: 'select', ok: false, note: reason });
    return hardStopResult(product, reason, log, ground);
  }
  await emit({ layer: 'select', ok: true, note: `primary="${selection.primary.candidate.keyword}", ${selection.secondaries.length} secondaries, ${selection.variantMap.length} variant terms, history=${selection.historyDecision}` });

  // ── rewrite ───────────────────────────────────────────────────────────────
  const window = depthToWindow(runConfig.depth);
  const rewriteInput: RewriteInput = {
    facts: ground.facts,
    store: ground.store,
    selection,
    brandVoiceNote: brand.voiceNote,
    vendorName: brand.vendorName,
    wordTarget: window,
    gaps: ground.gaps.map((g) => `${g.field}: ${g.note}`),
  };
  let draft = await deps.rewriter.rewrite(rewriteInput);
  await emit({ layer: 'rewrite', ok: true, note: `rewriter=${draft.rewriterId}, ${wordCount(draft.html)} words` });

  // ── aeo (toggle) ──────────────────────────────────────────────────────────
  let aeo: AeoFinding[] = [];
  if (runConfig.layers.aeo) {
    aeo = aeoCheck(draft, ground.facts, selection.primary.candidate.keyword);
    const aeoBlock = aeoBlockingFailures(aeo);
    await emit({ layer: 'aeo', ok: aeoBlock.length === 0, note: aeoBlock.length ? `blocking: ${aeoBlock.map((f) => f.check).join(', ')}` : 'all blocking checks pass' });
  }

  // ── guardrails (refuse-and-flag; BAD blocks) ──────────────────────────────
  const guardrailFlags = guardrails({
    draft,
    facts: ground.facts,
    brand,
    gaps: ground.gaps,
    selection,
    carried: ground.provenanceFlags,
  });
  const guardrailBlocked = hasBlockingFlag(guardrailFlags);
  await emit({ layer: 'guardrails', ok: !guardrailBlocked, note: `${guardrailFlags.length} flags${guardrailBlocked ? ' (BAD present - blocks)' : ''}` });

  // ── gates (one repair round) ──────────────────────────────────────────────
  const gateResult = runGates(draft, brand, window);
  draft = gateResult.draft; // use repaired draft downstream
  await emit({ layer: 'gates', ok: gateResult.violations.length === 0, note: `${gateResult.violations.length} violations after ${gateResult.repaired ? 1 : 0} repair round` });

  // ── verify (gate to completion; up to 2 attempts) ─────────────────────────
  let verdict: EngineVerdict = await deps.verifier.verify(draft, ground.facts);
  let attempts = 1;
  if (verdict.verdict === 'fail') {
    // deterministic rewriters won't change on retry, but the contract requires
    // "2 fails => self-flag". Re-run once to honor the attempt budget.
    verdict = await deps.verifier.verify(draft, ground.facts);
    attempts = 2;
  }
  const independentOk = deps.verifier.mode === 'independent' || !runConfig.groundedness;
  const verifierSatisfiesPass =
    verdict.verdict === 'pass' && deps.verifier.mode === 'independent';
  await emit({
    layer: 'verify',
    ok: verdict.verdict === 'pass',
    note: `verdict=${verdict.verdict} mode=${verdict.mode} attempts=${attempts}${verdict.verdict === 'pass' && verdict.mode === 'self-check' ? ' (self-check never satisfies PASS)' : ''}`,
  });

  // ── status decision ───────────────────────────────────────────────────────
  const blocking =
    guardrailBlocked ||
    gateResult.violations.length > 0 ||
    aeoBlockingFailures(aeo).length > 0 ||
    verdict.verdict === 'fail' ||
    !verifierSatisfiesPass; // independent pass required to ship for review
  const status: PieceResult['status'] = blocking ? 'flagged' : 'pending_review';

  // ── assemble contract PieceResult ─────────────────────────────────────────
  const computedWords = wordCount(draft.html);
  const violations = [
    ...toContractViolations(gateResult.violations),
    ...aeoBlockingFailures(aeo).map((f) => ({ gate: 'aeo' as const, message: `${f.check}: ${f.note}` })),
  ];
  const result: PieceResult = {
    kind: 'product',
    title: product.title,
    slug: draft.meta.slug,
    metaTitle: draft.meta.title,
    metaDescription: draft.meta.description,
    primaryKeyword: selection.primary.candidate.keyword,
    html: draft.html,
    jsonld: draft.jsonld,
    images: [],
    brief: toContractBrief({ selection, ground, wordTargetMax: window.max, wordCount: computedWords }),
    guardrailFlags,
    violations,
    verdict: toContractVerdict(verdict),
    status,
  };

  void independentOk;

  return {
    result,
    ground,
    selection,
    variantMap: selection.variantMap,
    gaps: ground.gaps.map((g) => `${g.field}: ${g.note}`),
    aeo,
    verdict,
    guardrailFlags,
    gateViolations: gateResult.violations,
    log,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// Article pipeline
// ════════════════════════════════════════════════════════════════════════════

export type ArticleRunDeps = {
  research: ResearchProvider;
  serp: SerpProvider;
  angle: AngleProvider;
  outline: OutlineProvider;
  critic: OutlineCritic;
  drafter: ArticleDrafter;
  citationChecker: CitationChecker;
  verifier: ArticleVerifier;
  /** optional image generator; only used when runConfig.layers.imageGen. */
  imageProvider?: ImageGenProvider;
  /** optional host for generated images; without it images inline as data URLs. */
  imageStore?: ImageStore;
};

export type ArticleRunOptions = {
  topic: string;
  brand: BrandProfile;
  catalogIndex: CatalogIndex;
  runConfig: RunConfig;
  deps: ArticleRunDeps;
  registry?: Registry;
  store?: Partial<StoreContext>;
  authority?: SiteAuthority;
  filterConfig?: FilterConfig;
  /** brand's own products the article may reference as internal (citation-free) facts. */
  relatedProducts?: NormalizedProduct[];
  /** external sources the drafter may cite (offline fixture; live = web search). */
  sources?: ArticleSource[];
  seedTerms?: string[];
  /** fires after each layer completes, for live progress streaming. */
  onProgress?: (stage: StageLog) => void | Promise<void>;
};

function articleDepthToWindow(depth: RunConfig['depth']): { min: number; max: number } {
  // Article word target is derived at outline; depth sets the gate window. Kept
  // wide so the deterministic template draft and long live drafts both pass.
  if (depth === 'brief') return { min: 200, max: 1200 };
  if (depth === 'deep') return { min: 500, max: 2600 };
  return { min: 250, max: 1800 };
}

function articleHardStop(
  topic: string,
  reason: string,
  log: StageLog[],
  ground: ArticleGroundResult | null,
): EngineRunResult {
  const result: PieceResult = {
    kind: 'article',
    title: topic,
    slug: '',
    metaTitle: '',
    metaDescription: '',
    primaryKeyword: '',
    html: '',
    jsonld: {},
    images: [],
    brief: {
      primaryKeyword: { keyword: '', volume: null, kd: null },
      secondaryKeywords: [],
      keywordDataSource: 'web-estimate',
      serpOwnershipNote: '',
      wordTarget: 0,
      wordCount: 0,
      historyDecision: 'net-new',
      exclusions: [],
    },
    guardrailFlags: ground ? ground.provenanceFlags : [],
    violations: [],
    verdict: { verdict: 'fail', isSelfCheck: false, perGate: {}, claimTrace: [], failures: [reason] },
    status: 'flagged',
  };
  return {
    result,
    ground: ground ? ({ ...ground, product: ground.pseudoProduct } as unknown as GroundResult) : ({} as GroundResult),
    selection: null,
    variantMap: [],
    gaps: ground ? ground.gaps.map((g) => `${g.field}: ${g.note}`) : [],
    aeo: [],
    verdict: null,
    guardrailFlags: ground ? ground.provenanceFlags : [],
    gateViolations: [],
    haltReason: reason,
    log,
    angle: null,
    outline: null,
    citations: [],
  };
}

export async function runArticle(opts: ArticleRunOptions): Promise<EngineRunResult> {
  const { topic, brand, catalogIndex, runConfig, deps } = opts;
  const log: StageLog[] = [];
  // record a stage AND stream it live (onProgress failures never break the run).
  const emit = async (s: StageLog) => { log[log.length] = s; try { await opts.onProgress?.(s); } catch { /* progress is best-effort */ } };
  const country = 'US';

  // ── ground (article; HARD STOP on unconfirmed brand) ──────────────────────
  let ground: ArticleGroundResult;
  try {
    ground = groundArticle({
      topic,
      brand,
      store: opts.store,
      authority: opts.authority,
      relatedProducts: opts.relatedProducts,
    });
  } catch (e) {
    if (e instanceof BrandUnconfirmedError) {
      await emit({ layer: 'ground', ok: false, note: e.message });
      return articleHardStop(topic, e.message, log, null);
    }
    throw e;
  }
  const groundView: GroundResult = { ...ground, product: ground.pseudoProduct };
  await emit({ layer: 'ground', ok: true, note: `${ground.facts.length} internal facts, ${ground.gaps.length} gaps` });

  // ── research ──────────────────────────────────────────────────────────────
  const seedTerms = opts.seedTerms ?? [topic, ...brand.seedTerms];
  const candidates = await deps.research.keywords(seedTerms, country);
  validateResearch(candidates);
  await emit({ layer: 'research', ok: true, note: `${candidates.length} raw candidates` });

  // ── filter (article mode: keep head/informational; drop PLP/SKU/competitor) ─
  const filtered = filterKeywords(candidates, catalogIndex, ground.pseudoProduct, opts.filterConfig ?? EZ_FABRIC_FILTER_CONFIG, 'article');
  await emit({ layer: 'filter', ok: true, note: `${filtered.kept.length} kept, ${filtered.dropped.length} dropped/routed` });

  // ── serp-ownership ────────────────────────────────────────────────────────
  const topN = Math.min(runConfig.depth === 'deep' ? 16 : 12, filtered.kept.length);
  const serp = await deps.serp.ownership(filtered.kept.slice(0, topN), ground.authority);
  await emit({ layer: 'serp-ownership', ok: true, note: `${serp.length} verdicts` });

  // ── select (article mode: informational/commercial primary, no variant map) ─
  let selection: Selection;
  try {
    selection = selectKeywords(filtered, serp, ground.pseudoProduct, opts.registry, 'article');
  } catch (e) {
    const reason = (e instanceof Error ? e.message : 'keyword selection failed') + ' - needs human review or different seed terms.';
    await emit({ layer: 'select', ok: false, note: reason });
    return articleHardStop(topic, reason, log, ground);
  }
  const keywords = [selection.primary.candidate.keyword, ...selection.secondaries.map((s) => s.candidate.keyword)];
  await emit({ layer: 'select', ok: true, note: `primary="${selection.primary.candidate.keyword}", ${selection.secondaries.length} secondaries, history=${selection.historyDecision}` });

  // ── angle (toggle) ────────────────────────────────────────────────────────
  let angleSet: AngleSet;
  if (runConfig.layers.angle) {
    angleSet = await deps.angle.angles(brand, selection.primary.candidate.keyword, serp);
    const v = validateAngle(angleSet);
    await emit({ layer: 'angle', ok: v.ok, note: v.ok ? `chosen: "${angleSet.chosen.headline}"` : `weak angle: ${v.issue} (proceeding with chosen)` });
  } else {
    const headline = selection.primary.candidate.keyword.replace(/\b\w/g, (c) => c.toUpperCase());
    const chosen: Angle = { lens: 'buyer-decision', headline, why: 'angle layer off; derived from primary keyword' };
    angleSet = { angles: [chosen], chosen, why: 'angle layer off' };
    await emit({ layer: 'angle', ok: true, note: 'angle layer off (derived from primary)' });
  }

  // ── outline + critic (ENFORCED loop; never draft on a failing outline) ─────
  const window = articleDepthToWindow(runConfig.depth);
  const loop = await runOutlineLoop(deps.outline, deps.critic, angleSet.chosen, keywords, window, serp, 3);
  if (loop.status === 'fail') {
    const reason = `outline failed critic after ${loop.rounds} rounds: ${loop.issues.join('; ')}`;
    await emit({ layer: 'outline+critic', ok: false, note: reason });
    const hs = articleHardStop(topic, reason, log, ground);
    hs.angle = angleSet;
    return hs; // HARD STOP: never draft on a failing outline
  }
  const outline = loop.outline;
  await emit({ layer: 'outline+critic', ok: true, note: `passed in ${loop.rounds} round(s), ${outline.sections.length} sections` });

  // ── draft ─────────────────────────────────────────────────────────────────
  let articleDraft = await deps.drafter.draft({
    outline,
    facts: ground.facts,
    brandVoiceNote: brand.voiceNote,
    vendorName: brand.vendorName,
    sources: opts.sources,
  });
  let pieceDraft: PieceDraft = { html: articleDraft.html, meta: articleDraft.meta, jsonld: articleDraft.jsonld, variantMap: [], rewriterId: articleDraft.drafterId };
  await emit({ layer: 'draft', ok: true, note: `drafter=${articleDraft.drafterId}, ${wordCount(pieceDraft.html)} words, ${articleDraft.citations.length} citations` });

  // ── citation-verify (toggle; blocking; one re-draft round) ────────────────
  let citationVerdicts: CitationVerdict[] = [];
  if (runConfig.layers.citationVerify && articleDraft.citations.length) {
    citationVerdicts = await verifyCitations(articleDraft.citations, deps.citationChecker);
    if (citationsBlocking(citationVerdicts)) {
      // one re-draft round, then accept the (still-blocking) result and self-flag.
      articleDraft = await deps.drafter.draft({ outline, facts: ground.facts, brandVoiceNote: brand.voiceNote, vendorName: brand.vendorName, sources: opts.sources });
      pieceDraft = { html: articleDraft.html, meta: articleDraft.meta, jsonld: articleDraft.jsonld, variantMap: [], rewriterId: articleDraft.drafterId };
      citationVerdicts = await verifyCitations(articleDraft.citations, deps.citationChecker);
    }
    const failed = failedCitations(citationVerdicts);
    await emit({ layer: 'citation-verify', ok: failed.length === 0, note: failed.length ? `${failed.length} failing citation(s): ${failed.map((f) => f.citation.url).join(', ')}` : `${citationVerdicts.length} citations verified` });
  }
  const citationBlocked = citationsBlocking(citationVerdicts);

  // ── aeo (toggle) ──────────────────────────────────────────────────────────
  let aeo: AeoFinding[] = [];
  if (runConfig.layers.aeo) {
    aeo = aeoCheck(pieceDraft, ground.facts, selection.primary.candidate.keyword, 'article');
    const aeoBlock = aeoBlockingFailures(aeo);
    await emit({ layer: 'aeo', ok: aeoBlock.length === 0, note: aeoBlock.length ? `blocking: ${aeoBlock.map((f) => f.check).join(', ')}` : 'all blocking checks pass' });
  }

  // ── guardrails ────────────────────────────────────────────────────────────
  const guardrailFlags = guardrails({ draft: pieceDraft, facts: ground.facts, brand, gaps: ground.gaps, selection, carried: ground.provenanceFlags });
  const guardrailBlocked = hasBlockingFlag(guardrailFlags);
  await emit({ layer: 'guardrails', ok: !guardrailBlocked, note: `${guardrailFlags.length} flags${guardrailBlocked ? ' (BAD present - blocks)' : ''}` });

  // ── gates (one repair round) ──────────────────────────────────────────────
  const gateResult = runGates(pieceDraft, brand, window);
  pieceDraft = gateResult.draft;
  articleDraft = { ...articleDraft, html: pieceDraft.html, meta: pieceDraft.meta, jsonld: pieceDraft.jsonld };
  await emit({ layer: 'gates', ok: gateResult.violations.length === 0, note: `${gateResult.violations.length} violations after ${gateResult.repaired ? 1 : 0} repair round` });

  // ── verify (article; gate to completion; up to 2 attempts) ────────────────
  let verdict = await deps.verifier.verify(pieceDraft, ground.facts, articleDraft.citations, citationVerdicts);
  let attempts = 1;
  if (verdict.verdict === 'fail') {
    verdict = await deps.verifier.verify(pieceDraft, ground.facts, articleDraft.citations, citationVerdicts);
    attempts = 2;
  }
  const verifierSatisfiesPass = verdict.verdict === 'pass' && deps.verifier.mode === 'independent';
  await emit({ layer: 'verify', ok: verdict.verdict === 'pass', note: `verdict=${verdict.verdict} mode=${verdict.mode} attempts=${attempts}` });

  // ── image-gen (toggle; renders the drafter's image prompts) ────────────────
  // Presentational only — runs after verify so it never affects grounding/gates.
  // Failures degrade to the placeholder + a WARN flag (never block publish).
  if (runConfig.layers.imageGen && deps.imageProvider && articleDraft.images.length) {
    const filled = await fillImages({
      html: pieceDraft.html,
      images: articleDraft.images,
      provider: deps.imageProvider,
      store: deps.imageStore,
      keyHint: pieceDraft.meta.slug,
    });
    pieceDraft = { ...pieceDraft, html: filled.html };
    articleDraft = { ...articleDraft, html: filled.html, images: filled.images };
    guardrailFlags.push(...filled.flags);
    const made = filled.flags.filter((f) => f.severity === 'GOOD').length;
    await emit({ layer: 'image-gen', ok: true, note: `${made}/${filled.images.length} image(s) generated via ${deps.imageProvider.id}` });
  }

  // ── status ────────────────────────────────────────────────────────────────
  const blocking =
    guardrailBlocked ||
    gateResult.violations.length > 0 ||
    aeoBlockingFailures(aeo).length > 0 ||
    citationBlocked ||
    verdict.verdict === 'fail' ||
    !verifierSatisfiesPass;
  const status: PieceResult['status'] = blocking ? 'flagged' : 'pending_review';

  // ── assemble PieceResult (kind 'article') ─────────────────────────────────
  const computedWords = wordCount(pieceDraft.html);
  const p = selection.primary;
  const serpNote = p.serp
    ? `Top owned by ${p.serp.owners.join(', ') || 'n/a'} (avg DR ${p.serp.avgDR ?? 'unknown'}); winnable: ${p.serp.winnable}.`
    : 'No SERP-ownership data for the primary keyword.';
  const violations = [
    ...toContractViolations(gateResult.violations),
    ...aeoBlockingFailures(aeo).map((f) => ({ gate: 'aeo' as const, message: `${f.check}: ${f.note}` })),
    ...failedCitations(citationVerdicts).map((c) => ({ gate: 'citation' as const, message: `${c.citation.url}: loads=${c.loads} supports=${c.supportsClaim} authority=${c.authorityOk}` })),
  ];
  const result: PieceResult = {
    kind: 'article',
    title: outline.title,
    slug: pieceDraft.meta.slug,
    metaTitle: pieceDraft.meta.title,
    metaDescription: pieceDraft.meta.description,
    primaryKeyword: p.candidate.keyword,
    html: pieceDraft.html,
    jsonld: pieceDraft.jsonld,
    images: articleDraft.images,
    brief: {
      primaryKeyword: { keyword: p.candidate.keyword, volume: p.candidate.volume, kd: p.candidate.kd },
      secondaryKeywords: selection.secondaries.map((s) => ({ keyword: s.candidate.keyword, volume: s.candidate.volume })),
      keywordDataSource: p.candidate.source,
      serpOwnershipNote: serpNote,
      wordTarget: window.max,
      wordCount: computedWords,
      historyDecision: selection.historyDecision,
      exclusions: selection.exclusions.map((e) => ({ keyword: e.keyword, reason: e.routedTo })),
    },
    guardrailFlags,
    violations,
    verdict: toContractVerdict(verdict),
    status,
  };

  return {
    result,
    ground: groundView,
    selection,
    variantMap: [],
    gaps: ground.gaps.map((g) => `${g.field}: ${g.note}`),
    aeo,
    verdict,
    guardrailFlags,
    gateViolations: gateResult.violations,
    log,
    angle: angleSet,
    outline,
    citations: citationVerdicts,
  };
}

// ── Top-level dispatcher ────────────────────────────────────────────────────

export type PieceRunOptions =
  | ({ kind: 'product' } & RunOptions)
  | ({ kind: 'article' } & ArticleRunOptions);

/** Dispatch by content type. */
export function runPiece(opts: PieceRunOptions): Promise<EngineRunResult> {
  return opts.kind === 'article' ? runArticle(opts) : runProductRewrite(opts);
}
