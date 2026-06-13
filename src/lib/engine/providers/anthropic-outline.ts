// Live outline provider (strong) + adversarial critic (fast). The enforced loop
// in pipeline.ts regenerates the outline fixing EVERY critic issue, up to 3 rounds.

import Anthropic from '@anthropic-ai/sdk';
import type { Angle, Outline, OutlineCritique, SerpOwnership } from '../types';
import type { OutlineProvider, OutlineCritic } from '../providers';
import { makeClient, structuredCall } from './anthropic';

const OUTLINE_SYSTEM = `You are an SEO+AEO content editor. Produce a typed article outline. Rules: title 8+ chars; slug <= 5 words, hyphenated; metaTitle 50-60 chars (hard cap 62) with the primary keyword near the front; metaDesc <= 155 chars; hook is 3 sentences answering who/what/how-different; at least 3 sections, each with an h2, a one-line reason it earns its place, and 1+ bullets; at least 3 FAQs with real buyer questions. No em dashes (use hyphens). If PRIOR ISSUES are given, fix EVERY one.

Return ONLY JSON: {"title":string,"slug":string,"metaTitle":string,"metaDesc":string,"hook":string,"sections":[{"h2":string,"reason":string,"bullets":[string]}],"faqs":[{"q":string,"a":string}]}.`;

const CRITIC_SYSTEM = `You are an adversarial outline critic with fresh eyes. Reject the outline if: any required field is missing or malformed (title, slug<=5 words, metaTitle<=62, metaDesc<=155, hook of 3 sentences, >=3 complete sections, >=3 FAQs); it does not differentiate from what the SERP owners already cover; or the structure would not let an LLM summarize the page in one paragraph. List EVERY concrete issue so the writer can fix them.

Return ONLY JSON: {"verdict":"pass"|"revise","issues":[string]}.`;

export class AnthropicOutlineProvider implements OutlineProvider {
  private client: Anthropic;
  constructor(opts?: { client?: Anthropic; apiKey?: string }) {
    this.client = opts?.client ?? makeClient({ apiKey: opts?.apiKey });
  }
  async outline(angle: Angle, keywords: string[], wordTarget: { min: number; max: number }, priorIssues?: string[]): Promise<Outline> {
    const user = [
      `ANGLE (${angle.lens}): ${angle.headline}`,
      `KEYWORDS: ${keywords.join(', ')}`,
      `WORD TARGET: ${wordTarget.min}-${wordTarget.max}`,
      priorIssues?.length ? `PRIOR ISSUES TO FIX (every one):\n- ${priorIssues.join('\n- ')}` : '',
    ].filter(Boolean).join('\n');
    return structuredCall<Outline>({ client: this.client, tier: 'strong', system: OUTLINE_SYSTEM, user, maxTokens: 2048 });
  }
}

export class AnthropicOutlineCritic implements OutlineCritic {
  private client: Anthropic;
  constructor(opts?: { client?: Anthropic; apiKey?: string }) {
    this.client = opts?.client ?? makeClient({ apiKey: opts?.apiKey });
  }
  async critique(outline: Outline, serp: SerpOwnership[]): Promise<OutlineCritique> {
    const owners = [...new Set(serp.flatMap((s) => s.owners))].slice(0, 8).join(', ') || 'unknown';
    const user = `SERP OWNERS: ${owners}\n\nOUTLINE:\n${JSON.stringify(outline)}`;
    return structuredCall<OutlineCritique>({ client: this.client, tier: 'fast', system: CRITIC_SYSTEM, user, maxTokens: 1024 });
  }
}
