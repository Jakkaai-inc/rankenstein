// LAYER serp-ownership (agent fast-tier fan-out, required)
//
// For the top-N shortlisted candidates, returns who owns the top SERP and
// whether THIS site (given its authority) can win. Engine calls an injected
// SerpProvider. Offline we use a fixture + a deterministic winnability heuristic
// derived from keyword difficulty and the provided site authority.

import type { KeywordCandidate, SerpVerdict, SiteAuthority, Winnable } from '../types';
import type { SerpProvider } from '../providers';

/**
 * Winnability heuristic, used when no per-keyword fixture verdict exists.
 * Conservative when site authority is unknown/low.
 */
export function estimateWinnable(kd: number | null, authority: SiteAuthority): Winnable {
  const dr = authority.dr;
  if (kd === null) return 'stretch'; // no difficulty signal → don't over-promise
  // low-DR/unknown sites can still take very-low-difficulty terms.
  if (kd <= 5) return 'yes';
  if (kd <= 15) return dr != null && dr >= 30 ? 'yes' : 'stretch';
  if (kd <= 35) return dr != null && dr >= 50 ? 'stretch' : 'no';
  return 'no';
}

/** Fixture provider: fixed verdicts where known, heuristic everywhere else. */
export class FixtureSerpProvider implements SerpProvider {
  constructor(private readonly fixture: Record<string, Partial<SerpVerdict>>) {}

  async ownership(
    candidates: KeywordCandidate[],
    siteAuthority: SiteAuthority,
  ): Promise<SerpVerdict[]> {
    return candidates.map((c) => {
      const f = this.fixture[c.keyword] ?? {};
      return {
        keyword: c.keyword,
        topUrls: f.topUrls ?? [],
        avgDR: f.avgDR ?? null,
        owners: f.owners ?? [],
        winnable: f.winnable ?? estimateWinnable(c.kd, siteAuthority),
      };
    });
  }
}
