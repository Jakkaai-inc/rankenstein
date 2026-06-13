// Offline wiring — fixture providers + a default RunConfig so the engine runs
// end-to-end with no network/DB. Live runs swap these for agent/Ahrefs/Shopify
// implementations of the same provider interfaces.

import type { RunConfig } from './types';
import type { RunDeps } from './pipeline';
import { FixtureResearchProvider } from './layers/research';
import { FixtureSerpProvider } from './layers/serp';
import { templateRewriter, naiveRewriter } from './layers/rewrite';
import { IndependentVerifier } from './layers/verify';
import { MINKY_RESEARCH, MINKY_SERP } from './fixtures/minky-keywords';

export const DEFAULT_RUN_CONFIG: RunConfig = {
  contentType: 'product',
  goal: 'improve_product',
  depth: 'standard',
  readability: 'standard',
  groundedness: 'strict',
  quality: { tables: true, quotes: false, kpiChips: false, charts: false, images: false },
  layers: { angle: false, aeo: true, citationVerify: false, imageGen: false },
  perPieceTokenCeiling: 60000,
  runSpendSoftStopUsd: 5,
};

/** Offline deps for the minky fixture. `naive:true` swaps in the ungrounded
 *  rewriter to demonstrate the verifier catching fabricated claims. */
export function offlineMinkyDeps(opts?: { naive?: boolean }): RunDeps {
  return {
    research: new FixtureResearchProvider(MINKY_RESEARCH),
    serp: new FixtureSerpProvider(MINKY_SERP),
    rewriter: opts?.naive ? naiveRewriter : templateRewriter,
    // deterministic INDEPENDENT grader (separate from the rewriter's context).
    verifier: new IndependentVerifier(),
  };
}
