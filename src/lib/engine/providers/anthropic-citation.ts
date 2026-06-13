// Live citation checker: Node fetch() confirms the URL returns 2xx (loads), then
// a fast-tier Anthropic call judges whether the fetched page supports the claim
// and whether the source is authoritative enough (high authority required for
// health / finance / legal claims). Any failure is blocking upstream.

import Anthropic from '@anthropic-ai/sdk';
import type { Citation, CitationVerdict } from '../types';
import type { CitationChecker } from '../providers';
import { makeClient, structuredCall } from './anthropic';
import { stripTags } from '../html';

// Recognized high-authority domains for high-stakes (health/finance/legal) claims.
const HIGH_AUTHORITY =
  /(?:\.gov|\.edu|\.org)$|nih\.gov|who\.int|aap\.org|healthychildren\.org|mayoclinic\.org|cdc\.gov|ftc\.gov|sec\.gov|consumerreports\.org|nist\.gov/i;

const SYSTEM = `You verify a citation. Given a CLAIM, its TOPIC, and the fetched PAGE TEXT, decide:
- supportsClaim: does the page actually substantiate the specific claim? (true/false)
- authorityOk: is this a credible source for the claim? For health/finance/legal topics it must be a high-authority source (government, academic, major medical/standards body, or established institution). For "general" topics a reputable industry or publication source is fine.
Return ONLY JSON: {"supportsClaim":boolean,"authorityOk":boolean}.`;

async function fetchText(url: string, timeoutMs = 8000): Promise<{ ok: boolean; text: string }> {
  try {
    const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return { ok: false, text: '' };
    const raw = await res.text();
    return { ok: true, text: stripTags(raw).slice(0, 5000) };
  } catch {
    return { ok: false, text: '' };
  }
}

export class FetchAgentCitationChecker implements CitationChecker {
  private client: Anthropic;
  constructor(opts?: { client?: Anthropic; apiKey?: string }) {
    this.client = opts?.client ?? makeClient({ apiKey: opts?.apiKey });
  }

  async check(citation: Citation): Promise<CitationVerdict> {
    const { ok, text } = await fetchText(citation.url);
    if (!ok) {
      return { citation, loads: false, supportsClaim: false, authorityOk: false };
    }
    let supportsClaim = false;
    let agentAuthority = false;
    try {
      const j = await structuredCall<{ supportsClaim: boolean; authorityOk: boolean }>({
        client: this.client,
        tier: 'fast',
        system: SYSTEM,
        user: `CLAIM: ${citation.claim}\nTOPIC: ${citation.topic ?? 'general'}\n\nPAGE TEXT:\n${text}`,
        maxTokens: 256,
      });
      supportsClaim = Boolean(j.supportsClaim);
      agentAuthority = Boolean(j.authorityOk);
    } catch {
      // if the judge call fails, be conservative: loads but unverified.
      return { citation, loads: true, supportsClaim: false, authorityOk: false };
    }

    const highStakes = (citation.topic ?? 'general') !== 'general';
    let host = '';
    try { host = new URL(citation.url).hostname; } catch { host = citation.url; }
    const domainAuthoritative = HIGH_AUTHORITY.test(host);
    // high-stakes claims need both the agent's nod and an authoritative domain.
    const authorityOk = highStakes ? agentAuthority && domainAuthoritative : agentAuthority;

    return { citation, loads: true, supportsClaim, authorityOk };
  }
}
