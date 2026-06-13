// Injected provider interfaces. The engine never calls the network itself — the
// same pure layer functions run offline (fixtures) or live (agents / Ahrefs /
// Shopify) depending on which implementation the orchestrator is handed.

import type {
  FactsTable,
  KeywordCandidate,
  PieceDraft,
  SerpVerdict,
  SiteAuthority,
  VerifierVerdict,
} from './types';

export interface ResearchProvider {
  /** RAW candidates, no self-filtering. Never fabricate volume/kd. */
  keywords(seedTerms: string[], country: string): Promise<KeywordCandidate[]>;
}

export interface SerpProvider {
  ownership(
    candidates: KeywordCandidate[],
    siteAuthority: SiteAuthority,
  ): Promise<SerpVerdict[]>;
}

/** Input handed to a rewriter (template or strong-tier agent). */
export type RewriteInput = {
  facts: FactsTable;
  store: { currency: string; locale: string; primaryDomain: string };
  /** selection result, kept loose to avoid a cycle with select types. */
  selection: import('./types').Selection;
  brandVoiceNote: string;
  vendorName: string;
  /** product body word target window. */
  wordTarget: { min: number; max: number };
};

export interface Rewriter {
  readonly id: string;
  rewrite(input: RewriteInput): Promise<PieceDraft>;
}

export interface Verifier {
  readonly mode: 'independent' | 'self-check';
  verify(piece: PieceDraft, facts: FactsTable): Promise<VerifierVerdict>;
}
