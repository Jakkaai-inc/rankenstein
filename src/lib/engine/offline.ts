// Offline wiring — fixture providers + a default RunConfig so the engine runs
// end-to-end with no network/DB. Live runs swap these for agent/Ahrefs/Shopify
// implementations of the same provider interfaces.

import type { RunConfig } from './types';
import type { RunDeps, ArticleRunDeps } from './pipeline';
import { FixtureResearchProvider } from './layers/research';
import { FixtureSerpProvider } from './layers/serp';
import { templateRewriter, naiveRewriter } from './layers/rewrite';
import { IndependentVerifier, IndependentArticleVerifier } from './layers/verify';
import { FixtureAngleProvider } from './layers/angle';
import { FixtureOutlineProvider, DeterministicCritic } from './layers/outline';
import { templateArticleDrafter, naiveArticleDrafter } from './layers/draft';
import { FixtureCitationChecker } from './layers/citation-verify';
import { MINKY_RESEARCH, MINKY_SERP } from './fixtures/minky-keywords';
import {
  ARTICLE_RESEARCH,
  ARTICLE_SERP,
  ARTICLE_ANGLE_SET,
  ARTICLE_OUTLINE,
  ARTICLE_CITATION_OK,
  ARTICLE_CITATION_BAD,
} from './fixtures/minky-article';

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

export const DEFAULT_ARTICLE_RUN_CONFIG: RunConfig = {
  contentType: 'article',
  goal: 'new_articles',
  depth: 'standard',
  readability: 'standard',
  groundedness: 'strict',
  quality: { tables: true, quotes: true, kpiChips: false, charts: false, images: true },
  layers: { angle: true, aeo: true, citationVerify: true, imageGen: false },
  perPieceTokenCeiling: 120000,
  runSpendSoftStopUsd: 8,
};

/** Offline deps for the article fixture. `naive:true` emits an uncited stat (the
 *  verifier catches it); `badCitation:true` makes one source fail verify. */
export function offlineArticleDeps(opts?: { naive?: boolean; badCitation?: boolean }): ArticleRunDeps {
  return {
    research: new FixtureResearchProvider(ARTICLE_RESEARCH),
    serp: new FixtureSerpProvider(ARTICLE_SERP),
    angle: new FixtureAngleProvider(ARTICLE_ANGLE_SET),
    outline: new FixtureOutlineProvider(ARTICLE_OUTLINE),
    critic: new DeterministicCritic(),
    drafter: opts?.naive ? naiveArticleDrafter : templateArticleDrafter,
    citationChecker: new FixtureCitationChecker(opts?.badCitation ? ARTICLE_CITATION_BAD : ARTICLE_CITATION_OK),
    verifier: new IndependentArticleVerifier(),
  };
}
