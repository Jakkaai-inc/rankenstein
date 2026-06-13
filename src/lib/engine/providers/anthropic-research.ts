// Live fast-tier research provider.
//
// IMPORTANT: a model has no real search volumes. This provider returns candidate
// KEYWORDS only, tagged source="web-estimate" with volume=null and kd=null. It
// NEVER fabricates numbers. A provider-verified source (Ahrefs) enriches these
// with real volume/kd downstream; until then web-estimate rows flow through as-is
// (the contract allows null numbers only for web-estimate).

import Anthropic from '@anthropic-ai/sdk';
import type { KeywordCandidate, Intent } from '../types';
import type { ResearchProvider } from '../providers';
import { makeClient, structuredCall } from './anthropic';

type RawKw = { keyword: string; intent: string; parentTopic?: string };

const VALID_INTENT: Intent[] = ['informational', 'commercial', 'transactional', 'local', 'navigational'];

const SYSTEM = `You are a keyword research assistant. Given seed terms for an ecommerce product/topic, list realistic buyer search queries: a mix of head, modifier, long-tail, question, and color/variant terms. Include sibling/competing terms too (do not self-filter; a downstream code filter handles routing).

You do NOT have access to search volume or difficulty data, so DO NOT output numbers for them.

Return ONLY a JSON array: [{"keyword": string, "intent": "informational"|"commercial"|"transactional"|"local"|"navigational", "parentTopic": string}]. 15-30 items.`;

export class AnthropicResearchProvider implements ResearchProvider {
  private client: Anthropic;
  constructor(opts?: { client?: Anthropic; apiKey?: string }) {
    this.client = opts?.client ?? makeClient({ apiKey: opts?.apiKey });
  }

  async keywords(seedTerms: string[], country: string): Promise<KeywordCandidate[]> {
    const user = `SEED TERMS: ${seedTerms.join(', ')}\nCOUNTRY: ${country}`;
    const raw = await structuredCall<RawKw[]>({
      client: this.client,
      tier: 'fast',
      system: SYSTEM,
      user,
      maxTokens: 2048,
      temperature: 0.7,
    });
    return raw
      .filter((r) => r && typeof r.keyword === 'string' && r.keyword.trim())
      .map((r) => ({
        keyword: r.keyword.trim().toLowerCase(),
        volume: null, // never fabricated; enrich via Ahrefs later
        kd: null,
        intent: (VALID_INTENT as string[]).includes(r.intent) ? (r.intent as Intent) : 'commercial',
        parentTopic: r.parentTopic ?? seedTerms[0] ?? '',
        source: 'web-estimate',
      }));
  }
}
