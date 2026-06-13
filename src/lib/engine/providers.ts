// Injected provider interfaces. The engine never calls the network itself — the
// same pure layer functions run offline (fixtures) or live (agents / Ahrefs /
// Shopify) depending on which implementation the orchestrator is handed.

import type {
  EngineVerdict,
  FactRows,
  KeywordCandidate,
  PieceDraft,
  SerpOwnership,
  SiteAuthority,
  StoreContext,
  Angle,
  AngleSet,
  ArticleDraft,
  BrandProfile,
  Citation,
  CitationTopic,
  CitationVerdict,
  Outline,
  OutlineCritique,
} from './types';

export interface ResearchProvider {
  /** RAW candidates, no self-filtering. Never fabricate volume/kd. */
  keywords(seedTerms: string[], country: string): Promise<KeywordCandidate[]>;
}

export interface SerpProvider {
  ownership(
    candidates: KeywordCandidate[],
    siteAuthority: SiteAuthority,
  ): Promise<SerpOwnership[]>;
}

/** Input handed to a rewriter (template or strong-tier agent). */
export type RewriteInput = {
  facts: FactRows;
  store: StoreContext;
  /** selection result, kept loose to avoid a cycle with select types. */
  selection: import('./types').Selection;
  brandVoiceNote: string;
  vendorName: string;
  /** product body word target window. */
  wordTarget: { min: number; max: number };
  /** data gaps (as "field: note") the rewriter must NOT assert. */
  gaps: string[];
};

export interface Rewriter {
  readonly id: string;
  rewrite(input: RewriteInput): Promise<PieceDraft>;
}

export interface Verifier {
  readonly mode: 'independent' | 'self-check';
  verify(piece: PieceDraft, facts: FactRows): Promise<EngineVerdict>;
}

// ── Article-pipeline provider interfaces ────────────────────────────────────

export interface AngleProvider {
  /** 4 lens angles + the chosen one. */
  angles(brand: BrandProfile, primaryKeyword: string, serp: SerpOwnership[]): Promise<AngleSet>;
}

export interface OutlineProvider {
  /** priorIssues lets the enforced loop regenerate fixing EVERY critic issue. */
  outline(
    angle: Angle,
    keywords: string[],
    wordTarget: { min: number; max: number },
    priorIssues?: string[],
  ): Promise<Outline>;
}

export interface OutlineCritic {
  /** adversarial, fresh context. */
  critique(outline: Outline, serp: SerpOwnership[]): Promise<OutlineCritique>;
}

export type ArticleSource = {
  url: string;
  title?: string;
  topic?: CitationTopic;
  /** the specific claim this source supports (may contain a stat/number). */
  claim?: string;
};

export type ArticleDraftInput = {
  outline: Outline;
  facts: FactRows;
  brandVoiceNote: string;
  vendorName: string;
  internalLinks?: { url: string; anchor: string }[];
  /** external sources the drafter may cite for non-internal claims. */
  sources?: ArticleSource[];
};

export interface ArticleDrafter {
  readonly id: string;
  draft(input: ArticleDraftInput): Promise<ArticleDraft>;
}

export interface CitationChecker {
  check(citation: Citation): Promise<CitationVerdict>;
}

export interface ArticleVerifier {
  readonly mode: 'independent' | 'self-check';
  verify(
    piece: PieceDraft,
    facts: FactRows,
    citations: Citation[],
    citationVerdicts: CitationVerdict[],
  ): Promise<EngineVerdict>;
}
