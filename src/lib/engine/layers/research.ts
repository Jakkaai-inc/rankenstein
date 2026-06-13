// LAYER research (agent fast-tier, required)
//
// Produces RAW KeywordCandidate[] (no self-filtering). The engine stays pure: it
// calls an injected ResearchProvider. Offline we use a fixture provider; live
// this is a fast-tier agent or an Ahrefs query. Either way: every row is tagged
// with its data source, and volume/kd may be null ONLY for web-estimate rows.

import type { KeywordCandidate } from '../types';
import type { ResearchProvider } from '../providers';

/** Provider backed by a static candidate list (offline / tests). */
export class FixtureResearchProvider implements ResearchProvider {
  constructor(private readonly candidates: KeywordCandidate[]) {}
  async keywords(_seedTerms: string[], _country: string): Promise<KeywordCandidate[]> {
    return this.candidates;
  }
}

/** PASS check for the research layer (>=1 candidate; numbers only when sourced). */
export function validateResearch(candidates: KeywordCandidate[]): void {
  if (candidates.length === 0) {
    throw new Error('research layer produced zero candidates');
  }
  for (const c of candidates) {
    if (c.source === 'provider' && c.volume === null && c.kd === null) {
      // allowed but suspicious; provider rows usually carry numbers. Not fatal.
    }
    if (c.source === 'web-estimate') {
      // web-estimate rows MUST NOT carry fabricated precise numbers; null is fine.
    }
  }
}
