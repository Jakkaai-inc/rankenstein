// Live deps builder — wires the Anthropic-backed providers into RunDeps.
// Each provider gets its own client; the verifier's separate client keeps its
// context independent from the writer's (RUBRIC verify-layer requirement).

import type { RunDeps } from '../pipeline';
import { AnthropicResearchProvider } from './anthropic-research';
import { AnthropicSerpProvider } from './anthropic-serp';
import { AnthropicRewriter } from './anthropic-rewrite';
import { AnthropicVerifier } from './anthropic-verify';

export function liveDeps(opts?: { apiKey?: string }): RunDeps {
  return {
    research: new AnthropicResearchProvider(opts),
    serp: new AnthropicSerpProvider(opts),
    rewriter: new AnthropicRewriter(opts),
    verifier: new AnthropicVerifier(opts),
  };
}

export { AnthropicResearchProvider } from './anthropic-research';
export { AnthropicSerpProvider } from './anthropic-serp';
export { AnthropicRewriter } from './anthropic-rewrite';
export { AnthropicVerifier } from './anthropic-verify';
export { makeClient, structuredCall, parseJsonLoose, MODELS } from './anthropic';
