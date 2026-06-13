// Live deps builder — wires the Anthropic-backed providers into RunDeps.
// Each provider gets its own client; the verifier's separate client keeps its
// context independent from the writer's (RUBRIC verify-layer requirement).

import type { RunDeps, ArticleRunDeps } from '../pipeline';
import { AnthropicResearchProvider } from './anthropic-research';
import { AnthropicSerpProvider } from './anthropic-serp';
import { AnthropicRewriter } from './anthropic-rewrite';
import { AnthropicVerifier } from './anthropic-verify';
import { AnthropicAngleProvider } from './anthropic-angle';
import { AnthropicOutlineProvider, AnthropicOutlineCritic } from './anthropic-outline';
import { AnthropicArticleDrafter } from './anthropic-draft';
import { FetchAgentCitationChecker } from './anthropic-citation';
import { IndependentArticleVerifier } from '../layers/verify';

export function liveDeps(opts?: { apiKey?: string }): RunDeps {
  return {
    research: new AnthropicResearchProvider(opts),
    serp: new AnthropicSerpProvider(opts),
    rewriter: new AnthropicRewriter(opts),
    verifier: new AnthropicVerifier(opts),
  };
}

/** Live deps for the article pipeline. Verifier independence comes from the
 *  IndependentArticleVerifier; you can pass a fresh-context agent grader to it. */
export function liveArticleDeps(opts?: { apiKey?: string }): ArticleRunDeps {
  return {
    research: new AnthropicResearchProvider(opts),
    serp: new AnthropicSerpProvider(opts),
    angle: new AnthropicAngleProvider(opts),
    outline: new AnthropicOutlineProvider(opts),
    critic: new AnthropicOutlineCritic(opts),
    drafter: new AnthropicArticleDrafter(opts),
    citationChecker: new FetchAgentCitationChecker(opts),
    verifier: new IndependentArticleVerifier(),
  };
}

export { AnthropicResearchProvider } from './anthropic-research';
export { AnthropicSerpProvider } from './anthropic-serp';
export { AnthropicRewriter } from './anthropic-rewrite';
export { AnthropicVerifier } from './anthropic-verify';
export { AnthropicAngleProvider } from './anthropic-angle';
export { AnthropicOutlineProvider, AnthropicOutlineCritic } from './anthropic-outline';
export { AnthropicArticleDrafter } from './anthropic-draft';
export { FetchAgentCitationChecker } from './anthropic-citation';
export { makeClient, structuredCall, parseJsonLoose, MODELS } from './anthropic';
