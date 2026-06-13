// Rankenstein engine — shared types.
//
// These mirror inputs/LAYER-CONTRACTS.md and the shared-contracts list in
// PARALLEL-LANES.md. They are intentionally local to the engine so Lane C can
// build before Lane A freezes src/types/contracts.ts. On "CONTRACTS FROZEN"
// these get re-exported from contracts.ts and the duplicates deleted.
//
// Erasable-only syntax (type annotations + const-as-const). No enums, no
// namespaces, no parameter properties — so Node 24 type-stripping runs it as-is.

// ---------------------------------------------------------------------------
// Provenance + facts
// ---------------------------------------------------------------------------

/** Provenance trust tiers (LAYER ground). T3 may never be asserted, only flagged. */
export type TrustTier = 'T1' | 'T2' | 'T3';

export type FactsTableRow = {
  /** canonical attribute name, e.g. "material", "width", "price.perYard" */
  field: string;
  /** the value exactly as grounded (string form; numbers kept as printed) */
  value: string;
  /** where it came from, e.g. "variants[].price", "options.Color", "body_html:spec-line", "shop.currency" */
  source: string;
  trust: TrustTier;
  /** optional human label appended in the brief, e.g. "merchant-stated" */
  label?: string;
};

export type FactsTable = FactsTableRow[];

/** A data gap the ground layer surfaces; never filled by guess. */
export type Gap = {
  field: string;
  note: string;
};

/** Store context, sourced from shop settings (T1). priceCurrency derives from here. */
export type StoreContext = {
  currency: string; // ISO 4217, e.g. "USD"
  locale: string; // e.g. "en-US"
  primaryDomain: string; // e.g. "ezfabricinc.com"
};

/** Site authority estimate consumed by serp-ownership. null DR ⇒ treat as low. */
export type SiteAuthority = {
  dr: number | null;
  source: 'provider' | 'web-estimate';
};

export type GroundResult = {
  facts: FactsTable;
  gaps: Gap[];
  store: StoreContext;
  authority: SiteAuthority;
  /** provenance flags raised during grounding (e.g. body demoted to T3) */
  provenanceFlags: GuardrailFlag[];
  /** the normalized product the rest of the pipeline reads */
  product: NormalizedProduct;
};

// ---------------------------------------------------------------------------
// Normalized product (snapshot or live, same shape)
// ---------------------------------------------------------------------------

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

export type NormalizedOption = {
  name: string;
  values: string[];
};

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

// ---------------------------------------------------------------------------
// Brand profile
// ---------------------------------------------------------------------------

export type BrandProfile = {
  name: string;
  /** HARD STOP gate: ground refuses to run in automated mode unless true. */
  confirmed: boolean;
  vendorName: string;
  primaryDomain: string;
  /** registered marks that may not be used as a generic product type. */
  trademarks: TrademarkEntry[];
  /** words the brand voice forbids (gates layer, A4). */
  bannedWords: string[];
  /** seed terms research expands from. */
  seedTerms: string[];
  voiceNote: string;
};

export type TrademarkEntry = {
  /** the mark, e.g. "Cuddle" */
  mark: string;
  owner: string;
  /** if true, lowercase descriptive use is tolerated but flagged WARN. */
  descriptiveUseTolerated: boolean;
};

// ---------------------------------------------------------------------------
// Keywords
// ---------------------------------------------------------------------------

export type SearchIntent =
  | 'transactional'
  | 'commercial'
  | 'informational'
  | 'navigational';

export type KeywordCandidate = {
  keyword: string;
  /** null allowed only when source = 'web-estimate'; never fabricate. */
  volume: number | null;
  kd: number | null;
  intent: SearchIntent;
  parentTopic: string;
  source: 'provider' | 'web-estimate';
};

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

export type Winnable = 'yes' | 'no' | 'stretch';

export type SerpVerdict = {
  keyword: string;
  topUrls: string[];
  avgDR: number | null;
  owners: string[];
  winnable: Winnable;
};

export type HistoryDecision = 'net-new' | 'spoke' | 'refresh';

/** A keyword's role in the final on-page map. */
export type KeywordRole = 'primary' | 'secondary' | 'faq' | 'anchor' | 'variant';

export type SelectedKeyword = {
  candidate: KeywordCandidate;
  role: KeywordRole;
  serp?: SerpVerdict;
};

/** Maps a search term to a real product variant value (variant keyword map). */
export type VariantKeywordMap = {
  keyword: string;
  volume: number | null;
  kd: number | null;
  /** the variant option value it maps to, e.g. "Taupe" */
  variantValue: string;
};

export type Selection = {
  primary: SelectedKeyword;
  secondaries: SelectedKeyword[];
  /** cannibalization routing: terms intentionally NOT targeted here. */
  exclusions: { keyword: string; volume: number | null; routedTo: string }[];
  variantMap: VariantKeywordMap[];
  /** brand-coined colorways with no generic demand — noted, not force-mapped. */
  unmappedColorways: string[];
  historyDecision: HistoryDecision;
};

// ---------------------------------------------------------------------------
// Registry / firewall state (read at run start; injected)
// ---------------------------------------------------------------------------

export type RegistryEntry = {
  keyword: string;
  intent: SearchIntent;
  parentTopic: string;
  /** the page that already owns this keyword */
  ownerPageId: string;
  /** top-10 SERP urls last seen for this keyword (for overlap test) */
  serpTop10?: string[];
};

export type Registry = {
  entries: RegistryEntry[];
};

// ---------------------------------------------------------------------------
// Draft + result
// ---------------------------------------------------------------------------

export type PieceMeta = {
  title: string;
  description: string;
  slug: string;
};

/** Output of the rewrite layer, before quality layers run. */
export type PieceDraft = {
  html: string;
  meta: PieceMeta;
  /** JSON-LD as a JS object (validated by stringify/parse in gates). */
  jsonld: Record<string, unknown>;
  variantMap: VariantKeywordMap[];
  /** which rewriter produced this — for honesty in the brief. */
  rewriterId: string;
};

// ---------------------------------------------------------------------------
// Quality layers
// ---------------------------------------------------------------------------

export type GuardrailSeverity = 'BAD' | 'WARN' | 'GOOD';
export type GuardrailType =
  | 'trademark'
  | 'regulated'
  | 'gap'
  | 'provenance'
  | 'other';

export type GuardrailFlag = {
  type: GuardrailType;
  severity: GuardrailSeverity;
  note: string;
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

export type ClaimTrace = {
  claim: string;
  source: string | null;
  trust: TrustTier | null;
  grounded: boolean;
};

export type VerifierMode = 'independent' | 'self-check';

export type VerifierVerdict = {
  verdict: 'pass' | 'fail';
  mode: VerifierMode;
  perGate: Record<string, { pass: boolean; note: string }>;
  claimTrace: ClaimTrace[];
};

// ---------------------------------------------------------------------------
// Run config + final result
// ---------------------------------------------------------------------------

export type RunConfig = {
  country: string; // e.g. "US"
  /** layer toggles (defaults applied in pipeline). */
  toggles: {
    aeo: boolean;
    guardrails: boolean;
  };
  /** product body word target window (computed, not estimated). */
  wordTarget: { min: number; max: number };
  /** how many shortlisted candidates go to serp-ownership. */
  serpTopN: number;
  /** require an independent-context verifier (automated runs). */
  requireIndependentVerifier: boolean;
};

export type ContentBrief = {
  target: { productId: number | string; title: string; store: string };
  keyword: {
    primary: string;
    source: 'provider' | 'web-estimate';
    confidence: string;
    serpOwnerNote: string;
  };
  wordTarget: { min: number; max: number };
  computedWordCount: number;
  exclusions: Selection['exclusions'];
  variantMap: VariantKeywordMap[];
  gaps: Gap[];
  guardrailFlags: GuardrailFlag[];
  verifier: { verdict: 'pass' | 'fail'; mode: VerifierMode };
  /** keyword roll-up table for the preview. */
  keywordTable: { keyword: string; volume: number | null; kd: number | null; intent: SearchIntent; role: KeywordRole }[];
};

/** Terminal status of a piece run. */
export type PieceStatus =
  | 'ready-for-review' // passed verifier, awaiting human approval
  | 'self-flagged' // verifier failed twice → human triage
  | 'hard-stopped'; // a required gate hard-stopped (e.g. brand unconfirmed)

export type PieceResult = {
  status: PieceStatus;
  html: string;
  meta: PieceMeta;
  jsonld: Record<string, unknown>;
  brief: ContentBrief;
  flags: GuardrailFlag[];
  verdict: VerifierVerdict | null;
  keywordMap: VariantKeywordMap[];
  /** AEO + gate diagnostics, surfaced in review. */
  aeo: AeoFinding[];
  gateViolations: GateViolation[];
  /** the reason, when hard-stopped. */
  haltReason?: string;
};
