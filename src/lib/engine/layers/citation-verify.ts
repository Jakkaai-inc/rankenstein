// LAYER citation-verify (agent fast-tier fan-out, toggle default on - articles)
//
// For every external citation, check: does the URL load (2xx), does the page
// actually support the claim, and is the source authoritative enough (high
// authority required for health/finance/legal). ANY failure is blocking ->
// remove/replace the source and rewrite the sentence (the orchestrator does one
// re-draft round, then self-flags). Engine calls an injected CitationChecker;
// offline we use a fixture, live a fetch + fast-tier agent.

import type { Citation, CitationVerdict } from '../types';
import type { CitationChecker } from '../providers';

/** Fixture checker: verdicts come from a map keyed by URL. Unknown URLs fail. */
export class FixtureCitationChecker implements CitationChecker {
  constructor(private readonly fixture: Record<string, Partial<CitationVerdict>>) {}
  async check(citation: Citation): Promise<CitationVerdict> {
    const f = this.fixture[citation.url] ?? {};
    return {
      citation,
      loads: f.loads ?? false,
      supportsClaim: f.supportsClaim ?? false,
      authorityOk: f.authorityOk ?? false,
    };
  }
}

/** Fan out over all citations (parallel). */
export async function verifyCitations(
  citations: Citation[],
  checker: CitationChecker,
): Promise<CitationVerdict[]> {
  return Promise.all(citations.map((c) => checker.check(c)));
}

/** A citation passes only if it loads, supports the claim, and is authoritative. */
export function citationOk(v: CitationVerdict): boolean {
  return v.loads && v.supportsClaim && v.authorityOk;
}

/** Any failing citation blocks the piece. */
export function citationsBlocking(verdicts: CitationVerdict[]): boolean {
  return verdicts.some((v) => !citationOk(v));
}

export function failedCitations(verdicts: CitationVerdict[]): CitationVerdict[] {
  return verdicts.filter((v) => !citationOk(v));
}
