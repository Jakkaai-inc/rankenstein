// Public engine API (Lane C). Import surface for the integrator / worker:
//
//   import { runProductRewrite, renderPreview, offlineMinkyDeps } from '@/lib/engine';
//
// Live runs implement the provider interfaces (ResearchProvider, SerpProvider,
// Rewriter, Verifier) with agents/Ahrefs/Shopify and pass them as RunDeps.

// Orchestrator
export { runProductRewrite, runArticle, runPiece } from './pipeline';
export type {
  EngineRunResult,
  RunOptions,
  RunDeps,
  ArticleRunOptions,
  ArticleRunDeps,
  PieceRunOptions,
  StageLog,
} from './pipeline';

// Provider interfaces (live impls plug in here)
export type {
  ResearchProvider,
  SerpProvider,
  Rewriter,
  Verifier,
  RewriteInput,
  AngleProvider,
  OutlineProvider,
  OutlineCritic,
  ArticleDrafter,
  ArticleDraftInput,
  ArticleSource,
  CitationChecker,
  ArticleVerifier,
} from './providers';

// Layers (callable individually)
export { groundProduct, BrandUnconfirmedError, trustedFact, defaultStore } from './layers/ground';
export { FixtureResearchProvider, validateResearch } from './layers/research';
export { filterKeywords, EZ_FABRIC_FILTER_CONFIG } from './layers/filter';
export type { FilterConfig } from './layers/filter';
export { FixtureSerpProvider, estimateWinnable } from './layers/serp';
export { selectKeywords } from './layers/select';
export { templateRewriter, naiveRewriter } from './layers/rewrite';
export { aeoCheck, aeoBlockingFailures } from './layers/aeo';
export { guardrails, hasBlockingFlag } from './layers/guardrails';
export { runGates } from './layers/gates';
export { gradePiece, gradeArticle, SelfCheckVerifier, IndependentVerifier, IndependentArticleVerifier } from './layers/verify';

// Article layers
export { groundArticle } from './layers/ground';
export { FixtureAngleProvider, validateAngle, angleIsSubjectLine } from './layers/angle';
export { FixtureOutlineProvider, DeterministicCritic, runOutlineLoop } from './layers/outline';
export { templateArticleDrafter, naiveArticleDrafter } from './layers/draft';
export { FixtureCitationChecker, verifyCitations, citationsBlocking, failedCitations, citationOk } from './layers/citation-verify';

// Catalog + snapshot helpers
export { buildCatalogIndex, tokenize, countMatching, productTokens } from './catalog';
export type { CatalogIndex } from './catalog';
export { normalizeProduct, loadSnapshot, findRaw } from './snapshot';
export type { Snapshot } from './snapshot';

// Contract adapters
export {
  toContractFactsTable,
  toContractVerdict,
  toContractViolations,
  toContractBrief,
} from './adapters';

// Preview + offline wiring
export { renderPreview } from './preview';
export { offlineMinkyDeps, DEFAULT_RUN_CONFIG, offlineArticleDeps, DEFAULT_ARTICLE_RUN_CONFIG } from './offline';

// Live Anthropic-backed providers (implement the provider interfaces)
export {
  liveDeps,
  liveArticleDeps,
  AnthropicResearchProvider,
  AnthropicSerpProvider,
  AnthropicRewriter,
  AnthropicVerifier,
  AnthropicAngleProvider,
  AnthropicOutlineProvider,
  AnthropicOutlineCritic,
  AnthropicArticleDrafter,
  FetchAgentCitationChecker,
  makeClient,
  structuredCall,
  parseJsonLoose,
  MODELS,
} from './providers/live';

// Brand fixture + regulated patterns
export { EZ_FABRIC_BRAND, EZ_FABRIC_BRAND_UNCONFIRMED, REGULATED_CLAIM_PATTERNS } from './brand';

// Types (engine-private + re-exported contract types)
export type * from './types';
