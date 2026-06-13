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
  const country = 'US';

  // ── ground (HARD STOP on unconfirmed brand) ───────────────────────────────
  let ground: GroundResult;
  try {
    ground = groundProduct({ product, brand, store: opts.store, authority: opts.authority });
  } catch (e) {
    if (e instanceof BrandUnconfirmedError) {
      log.push({ layer: 'ground', ok: false, note: e.message });
      return hardStopResult(product, e.message, log, null);
    }
    throw e;
  }
  log.push({ layer: 'ground', ok: true, note: `${ground.facts.length} facts, ${ground.gaps.length} gaps, ${ground.provenanceFlags.length} provenance flags` });

  // ── research ──────────────────────────────────────────────────────────────
  const seedTerms = opts.seedTerms ?? brand.seedTerms;
  const candidates = await deps.research.keywords(seedTerms, country);
  validateResearch(candidates);
  log.push({ layer: 'research', ok: true, note: `${candidates.length} raw candidates` });

  // ── filter (deterministic) ────────────────────────────────────────────────
  const filtered = filterKeywords(candidates, catalogIndex, product, opts.filterConfig ?? EZ_FABRIC_FILTER_CONFIG);
  log.push({ layer: 'filter', ok: true, note: `${filtered.kept.length} kept, ${filtered.dropped.length} dropped/routed` });

  // ── serp-ownership (top N) ────────────────────────────────────────────────
  const topN = Math.min(runConfig.depth === 'deep' ? 16 : 12, filtered.kept.length);
  const shortlist = filtered.kept.slice(0, topN);
  const serp = await deps.serp.ownership(shortlist, ground.authority);
  log.push({ layer: 'serp-ownership', ok: true, note: `${serp.length} verdicts` });

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
    log.push({ layer: 'select', ok: false, note: reason });
    return hardStopResult(product, reason, log, ground);
  }
  log.push({ layer: 'select', ok: true, note: `primary="${selection.primary.candidate.keyword}", ${selection.secondaries.length} secondaries, ${selection.variantMap.length} variant terms, history=${selection.historyDecision}` });

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
  log.push({ layer: 'rewrite', ok: true, note: `rewriter=${draft.rewriterId}, ${wordCount(draft.html)} words` });

  // ── aeo (toggle) ──────────────────────────────────────────────────────────
  let aeo: AeoFinding[] = [];
  if (runConfig.layers.aeo) {
    aeo = aeoCheck(draft, ground.facts, selection.primary.candidate.keyword);
    const aeoBlock = aeoBlockingFailures(aeo);
    log.push({ layer: 'aeo', ok: aeoBlock.length === 0, note: aeoBlock.length ? `blocking: ${aeoBlock.map((f) => f.check).join(', ')}` : 'all blocking checks pass' });
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
  log.push({ layer: 'guardrails', ok: !guardrailBlocked, note: `${guardrailFlags.length} flags${guardrailBlocked ? ' (BAD present - blocks)' : ''}` });

  // ── gates (one repair round) ──────────────────────────────────────────────
  const gateResult = runGates(draft, brand, window);
  draft = gateResult.draft; // use repaired draft downstream
  log.push({ layer: 'gates', ok: gateResult.violations.length === 0, note: `${gateResult.violations.length} violations after ${gateResult.repaired ? 1 : 0} repair round` });

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
  log.push({
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
