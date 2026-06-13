// Live strong-tier angle provider: 4 lens angles + a chosen subject-line headline.

import Anthropic from '@anthropic-ai/sdk';
import type { AngleSet, BrandProfile, SerpOwnership } from '../types';
import type { AngleProvider } from '../providers';
import { makeClient, structuredCall } from './anthropic';

const SYSTEM = `You are a content strategist. Given a brand, a primary keyword, and who owns the SERP, propose FOUR article angles, one per lens: "contrarian", "data-led", "buyer-decision", "maker-pain". Each angle's headline must be specific enough to use as an email subject line (4-16 words, concrete, not a generic label like "Guide"). Then choose the single best angle for the intent.

Return ONLY JSON: {"angles":[{"lens":"contrarian"|"data-led"|"buyer-decision"|"maker-pain","headline":string,"why":string}],"chosen":{"lens":...,"headline":...,"why":...},"why":string}.`;

export class AnthropicAngleProvider implements AngleProvider {
  private client: Anthropic;
  constructor(opts?: { client?: Anthropic; apiKey?: string }) {
    this.client = opts?.client ?? makeClient({ apiKey: opts?.apiKey });
  }
  async angles(brand: BrandProfile, primaryKeyword: string, serp: SerpOwnership[]): Promise<AngleSet> {
    const owners = [...new Set(serp.flatMap((s) => s.owners))].slice(0, 8).join(', ') || 'unknown';
    const user = `BRAND: ${brand.vendorName}\nVOICE: ${brand.voiceNote}\nPRIMARY KEYWORD: ${primaryKeyword}\nSERP OWNERS: ${owners}`;
    return structuredCall<AngleSet>({ client: this.client, tier: 'strong', system: SYSTEM, user, maxTokens: 1024 });
  }
}
