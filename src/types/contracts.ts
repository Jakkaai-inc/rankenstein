// Shared contracts — Build Day 2026-06-13. Lane A owns this file; the names and
// shapes here are LAW for all lanes (engine, shopify, review). Mirrors
// inputs/LAYER-CONTRACTS.md. Change only via Lane A after a LANE-REQUESTS.md note.

// ── Grounding ──────────────────────────────────────────────────────────────
export type TrustTier = "T1" | "T2" | "T3";
// T1 structured fields · T2 merchant-stated spec lines · T3 unverified prose (never asserted)

export interface FactsRow {
  field: string;
  value: string;
  source: string; // where it came from (e.g. "variants[].price", "body_html spec line")
  trust: TrustTier;
}

export interface FactsTable {
  rows: FactsRow[];
  gaps: string[]; // explicitly missing facts to flag, never fill (e.g. "GSM missing")
  provenanceFlags: string[]; // e.g. "body_html contains pasted AI-chat artifacts -> demoted to T3"
}

export interface StoreContext {
  currency: string | null;
  locale: string | null;
  primaryDomain: string | null;
}

// ── Keyword research / selection ───────────────────────────────────────────
export type Intent =
  | "informational"
  | "commercial"
  | "transactional"
  | "local"
  | "navigational";

export type Breadth = "head" | "mid" | "long_tail" | "variant";
export type DataSource = "provider-verified" | "web-estimate";

export interface KeywordCandidate {
  keyword: string;
  volume: number | null; // null allowed for web-estimate; never fabricate
  kd: number | null;
  intent: Intent;
  parentTopic?: string;
  source: DataSource;
  serpTopUrls?: string[];
}

export type Winnable = "yes" | "no" | "stretch";

export interface SerpOwnership {
  keyword: string;
  topUrls: string[];
  avgDR: number | null;
  owners: string[];
  winnable: Winnable;
}

export interface KeywordSelection {
  primary: KeywordCandidate;
  secondaries: KeywordCandidate[];
  exclusions: { keyword: string; reason: string }[]; // cannibalization routing
  historyDecision: "net-new" | "spoke" | "refresh";
  spokeLinkPageId?: string;
}

export interface SiteAuthority {
  dr: number | null;
  source: DataSource;
}

// ── Run configuration (UI toggles map 1:1 to engine layers) ────────────────
export type ContentType = "product" | "article";
export type Goal = "new_articles" | "update_articles" | "improve_product";

export interface QualityKnobs {
  tables: boolean;
  quotes: boolean;
  kpiChips: boolean;
  charts: boolean;
  images: boolean;
}

export interface LayerToggles {
  angle: boolean;
  aeo: boolean;
  citationVerify: boolean;
  imageGen: boolean;
}

export interface RunConfig {
  contentType: ContentType;
  goal: Goal;
  depth: "brief" | "standard" | "deep";
  readability: "simple" | "standard" | "technical";
  groundedness: "strict" | "balanced";
  quality: QualityKnobs;
  layers: LayerToggles;
  perPieceTokenCeiling: number;
  runSpendSoftStopUsd: number;
}

// ── A piece moving through the pipeline ────────────────────────────────────
export interface PieceTarget {
  kind: ContentType;
  productId?: string; // for product rewrites
  topic?: string; // for articles
  sourceProductJson?: unknown; // raw catalog/live product for grounding
}

export interface ImageSlot {
  prompt: string; // data-image-prompt
  alt: string;
  title: string;
  src?: string; // filled by image-gen layer, else placeholder
}

export interface GuardrailFlag {
  type: "trademark" | "regulated" | "gap" | "provenance" | "other";
  severity: "BAD" | "WARN" | "GOOD";
  note: string;
}

export interface Violation {
  gate: "brand-voice" | "structure" | "citation" | "aeo";
  message: string;
}

export interface ContentBrief {
  primaryKeyword: { keyword: string; volume: number | null; kd: number | null };
  secondaryKeywords: { keyword: string; volume: number | null }[];
  keywordDataSource: DataSource;
  serpOwnershipNote: string;
  wordTarget: number;
  wordCount: number; // computed, never estimated
  historyDecision: string;
  exclusions: { keyword: string; reason: string }[];
}

export interface ClaimTrace {
  claim: string;
  source: string;
  trust: TrustTier;
}

export interface VerifierVerdict {
  verdict: "pass" | "fail";
  isSelfCheck: boolean; // self-checks NEVER satisfy the verify layer
  perGate: Record<string, "pass" | "fail" | string>;
  claimTrace: ClaimTrace[];
  failures: string[];
}

// The full result of running the per-piece workflow.
export interface PieceResult {
  kind: ContentType;
  title: string;
  slug: string;
  metaTitle: string;
  metaDescription: string;
  primaryKeyword: string;
  html: string;
  jsonld: unknown; // Article+FAQPage or Product schema object(s)
  images: ImageSlot[];
  brief: ContentBrief;
  guardrailFlags: GuardrailFlag[];
  violations: Violation[];
  verdict: VerifierVerdict;
  status: "pending_review" | "flagged"; // flagged = failed verify twice -> human triage
}

// Generic layer return so the orchestrator can log per-stage.
export interface LayerResult<T> {
  layer: string;
  ok: boolean;
  data: T;
  note?: string;
  tokensUsed?: number;
}

// ── Review loop ────────────────────────────────────────────────────────────
export interface CommentAnchor {
  mode: "global" | "span";
  selector?: string; // CSS/path selector into the rendered preview
  textQuote?: string; // the highlighted text (robust re-anchoring)
  startOffset?: number;
  endOffset?: number;
}

export interface ReviewComment {
  id: string;
  version: number;
  anchor: CommentAnchor;
  body: string;
  modality: "text" | "voice";
}

export interface FeedbackSet {
  pieceId: string;
  version: number;
  comments: ReviewComment[];
}

// Output of the surgical-edit + span-diff-verify review workflow.
export interface SurgicalEditResult {
  newHtml: string;
  perComment: { commentId: string; resolution: string }[];
  surgical: boolean; // true iff only commented spans changed
  untouchedSectionsChanged: string[];
}
