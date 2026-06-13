// Live fast-tier SERP-ownership provider (web-estimate fallback).
//
// Without a live SERP API the model estimates likely top owners and winnability
// from its knowledge, given the site's authority. avgDR is left null (an honest
// "unknown") unless a provider supplies it. A real SerpProvider (SERP API +
// Ahrefs DR) should replace this for provider-verified verdicts.

import Anthropic from '@anthropic-ai/sdk';
import type { KeywordCandidate, SerpOwnership, SiteAuthority, Winnable } from '../types';
import type { SerpProvider } from '../providers';
import { makeClient, structuredCall } from './anthropic';

type RawSerp = { keyword: string; owners?: string[]; winnable?: string };
const VALID_WINNABLE: Winnable[] = ['yes', 'no', 'stretch'];

const SYSTEM = `You estimate search-result ownership. For each keyword, given the publishing site's domain authority, name the kinds of domains likely to rank in the top results and judge whether THIS site can realistically win (yes/stretch/no). You do not have live SERP data, so do not output DR numbers. Be conservative when the site authority is low or unknown.

Return ONLY a JSON array: [{"keyword": string, "owners": string[], "winnable": "yes"|"stretch"|"no"}].`;

export class AnthropicSerpProvider implements SerpProvider {
  private client: Anthropic;
  constructor(opts?: { client?: Anthropic; apiKey?: string }) {
    this.client = opts?.client ?? makeClient({ apiKey: opts?.apiKey });
  }

  async ownership(candidates: KeywordCandidate[], siteAuthority: SiteAuthority): Promise<SerpOwnership[]> {
    if (candidates.length === 0) return [];
    const user = [
      `SITE AUTHORITY (DR): ${siteAuthority.dr ?? 'unknown'} (source: ${siteAuthority.source})`,
      'KEYWORDS:',
      candidates.map((c) => `- ${c.keyword} (kd ${c.kd ?? 'unknown'})`).join('\n'),
    ].join('\n');

    const raw = await structuredCall<RawSerp[]>({
      client: this.client,
      tier: 'fast',
      system: SYSTEM,
      user,
      maxTokens: 1536,
      temperature: 0.3,
    });
    const byKw = new Map(raw.map((r) => [r.keyword?.toLowerCase(), r]));

    return candidates.map((c) => {
      const r = byKw.get(c.keyword.toLowerCase());
      const winnable = r && (VALID_WINNABLE as string[]).includes(r.winnable ?? '') ? (r.winnable as Winnable) : 'stretch';
      return {
        keyword: c.keyword,
        topUrls: [],
        avgDR: null, // honest unknown without a live SERP/DR source
        owners: r?.owners ?? [],
        winnable,
      };
    });
  }
}
