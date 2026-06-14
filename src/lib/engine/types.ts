// Rankenstein engine — types.
//
// CONTRACTS FROZEN (2026-06-13): the shared shapes are LAW and live in
// src/types/contracts.ts. This file RE-EXPORTS them and adds engine-PRIVATE
// types the contracts don't define (normalized product, internal selection,
// gates/aeo diagnostics, the rich internal verdict). The engine flows
// `FactsRow[]` between layers and assembles the contract `FactsTable` object at
// the boundary (see adapters.ts).
//
// Erasable-only syntax (no enums/namespaces/param-properties) so the files also
// run under Node's type-stripper if ever needed.

// ── Re-exported contract types (the law) ────────────────────────────────────
export type {
  TrustTier,
  FactsRow,
  FactsTable,
  StoreContext,
  Intent,
  Breadth,
  DataSource,
  KeywordCandidate,
  Winnable,
  SerpOwnership,
  KeywordSelection,
  SiteAuthority,
  ContentType,
  Goal,
  QualityKnobs,
  LayerToggles,
  RunConfig,
  PieceTarget,
  ImageSlot,
  GuardrailFlag,
  Violation,
  ContentBrief,
  ClaimTrace,
  VerifierVerdict,
  PieceResult,
  LayerResult,
} from '../../types/contracts';

import type {
  FactsRow,
  KeywordCandidate,
  SerpOwnership,
  Intent,
  TrustTier,
  ImageSlot,
} from '../../types/contracts';

/** Internal facts flow type (contract FactsTable is an object; layers pass rows). */
export type FactRows = FactsRow[];

// ── Engine-private: normalized product (snapshot or live, same shape) ────────

export type NormalizedVariant = {
  id: number | string;
  title: string;
  option1: string | null;
  option2: string | null;
  option3: string | null;
  sku: string | null;
  price: string | null;
  compareAtPrice: string | null;
  available: boolean;
  grams: number | null;
};

export type NormalizedOption = { name: string; values: string[] };

export type NormalizedProduct = {
  id: number | string;
  title: string;
  handle: string;
  bodyHtml: string;
  vendor: string;
  productType: string;
  tags: string[];
  options: NormalizedOption[];
  variants: NormalizedVariant[];
  imageCount: number;
};

// ── Engine-private: grounding intermediates ─────────────────────────────────

/** A data gap; surfaced as a string in the contract FactsTable.gaps. */
export type Gap = { field: string; note: string };

export type GroundResult = {
  facts: FactRows;
  gaps: Gap[];
  store: import('../../types/contracts').StoreContext;
  authority: import('../../types/contracts').SiteAuthority;
  /** rich provenance flags; flattened to strings for contract FactsTable. */
  provenanceFlags: import('../../types/contracts').GuardrailFlag[];
  product: NormalizedProduct;
};

// ── Engine-private: brand profile ───────────────────────────────────────────

export type TrademarkEntry = {
  mark: string;
  owner: string;
  descriptiveUseTolerated: boolean;
};

export type BrandProfile = {
  name: string;
  confirmed: boolean;
  vendorName: string;
  primaryDomain: string;
  trademarks: TrademarkEntry[];
  bannedWords: string[];
  seedTerms: string[];
  voiceNote: string;
  /** Confirmed brand-level facts (markdown bullets: location, ownership, etc.).
   *  A legitimate grounding source so true brand statements ("LA-rooted, female-led")
   *  are not flagged as ungrounded by the otherwise product-facts-only verifier. */
  brandFacts?: string;
};

// ── Engine-private: filter / select intermediates ───────────────────────────

export type DropReason =
  | 'head-or-category'
  | 'sibling-sku'
  | 'competitor-brand'
  | 'near-me'
  | 'plp-or-sku-pattern';

export type FilterResult = {
  kept: KeywordCandidate[];
  dropped: { candidate: KeywordCandidate; reason: DropReason; detail: string }[];
};

export type HistoryDecision = 'net-new' | 'spoke' | 'refresh';

export type KeywordRole = 'primary' | 'secondary' | 'faq' | 'anchor' | 'variant';

export type SelectedKeyword = {
  candidate: KeywordCandidate;
  role: KeywordRole;
  serp?: SerpOwnership;
};

export type VariantKeywordMap = {
  keyword: string;
  volume: number | null;
  kd: number | null;
  variantValue: string;
};

/** Engine-private selection (richer than the contract KeywordSelection: carries
 *  roles, SERP, variant map, and unmapped colorways for the rewrite + brief). */
export type Selection = {
  primary: SelectedKeyword;
  secondaries: SelectedKeyword[];
  exclusions: { keyword: string; volume: number | null; routedTo: string }[];
  variantMap: VariantKeywordMap[];
  unmappedColorways: string[];
  historyDecision: HistoryDecision;
};

// ── Engine-private: firewall / registry state ───────────────────────────────

export type RegistryEntry = {
  keyword: string;
  intent: Intent;
  parentTopic: string;
  ownerPageId: string;
  serpTop10?: string[];
};

export type Registry = { entries: RegistryEntry[] };

// ── Engine-private: draft + diagnostics ─────────────────────────────────────

export type PieceMeta = { title: string; description: string; slug: string };

export type PieceDraft = {
  html: string;
  meta: PieceMeta;
  jsonld: Record<string, unknown>;
  variantMap: VariantKeywordMap[];
  rewriterId: string;
};

export type AeoFinding = {
  check:
    | 'three-sentence'
    | 'extractability'
    | 'differentiation'
    | 'one-paragraph'
    | 'faq'
    | 'spec-table';
  pass: boolean;
  blocking: boolean;
  note: string;
};

export type GateViolation = {
  gate:
    | 'em-dash'
    | 'emoji-heading'
    | 'banned-word'
    | 'h1-count'
    | 'slug-length'
    | 'word-count'
    | 'jsonld-parse'
    | 'meta-title-length'
    | 'meta-desc-length';
  detail: string;
};

// ── Engine-private: the rich internal verdict (adapter → contract verdict) ───

export type InternalClaimTrace = {
  claim: string;
  source: string | null;
  trust: TrustTier | null;
  grounded: boolean;
};

export type VerifierMode = 'independent' | 'self-check';

export type EngineVerdict = {
  verdict: 'pass' | 'fail';
  mode: VerifierMode;
  perGate: Record<string, { pass: boolean; note: string }>;
  claimTrace: InternalClaimTrace[];
};

// ── Engine-private: article pipeline ────────────────────────────────────────

export type ArticleTarget = {
  topic: string;
  /** optional related products to ground internal facts against. */
  relatedProducts?: NormalizedProduct[];
};

export type AngleLens = 'contrarian' | 'data-led' | 'buyer-decision' | 'maker-pain';

export type Angle = {
  lens: AngleLens;
  /** a specific, subject-line-worthy headline for this angle. */
  headline: string;
  why: string;
};

export type AngleSet = {
  angles: Angle[];
  chosen: Angle;
  why: string;
};

export type OutlineSection = {
  h2: string;
  reason: string;
  bullets: string[];
};

export type ArticleFaq = { q: string; a: string };

export type Outline = {
  title: string;
  slug: string;
  metaTitle: string;
  metaDesc: string;
  hook: string;
  sections: OutlineSection[];
  faqs: ArticleFaq[];
};

export type OutlineCritique = {
  verdict: 'pass' | 'revise';
  issues: string[];
};

export type CitationTopic = 'general' | 'health' | 'finance' | 'legal';

/** An external citation attached to a factual claim in an article draft. */
export type Citation = {
  url: string;
  anchor: string;
  claim: string;
  /** claims in these areas require a high-authority source. */
  topic?: CitationTopic;
};

export type CitationVerdict = {
  citation: Citation;
  loads: boolean;
  supportsClaim: boolean;
  authorityOk: boolean;
};

export type ArticleDraft = {
  html: string;
  meta: PieceMeta;
  jsonld: Record<string, unknown>;
  citations: Citation[];
  images: ImageSlot[];
  drafterId: string;
};
