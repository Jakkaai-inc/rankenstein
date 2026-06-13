// Live strong-tier rewriter. Produces the grounded product body + meta + JSON-LD
// from the FactsTable. The SAME downstream gates/guardrails/verifier run after
// it, so an agent that invents a claim is caught exactly like the naive rewriter.

import Anthropic from '@anthropic-ai/sdk';
import type { PieceDraft, PieceMeta, FactRows } from '../types';
import type { Rewriter, RewriteInput } from '../providers';
import { makeClient, structuredCall } from './anthropic';

type RewriteJson = {
  html: string;
  metaTitle: string;
  metaDescription: string;
  slug: string;
  jsonld: Record<string, unknown>;
};

function renderFacts(facts: FactRows): string {
  const usable = facts.filter((f) => f.trust === 'T1' || f.trust === 'T2');
  return usable.map((f) => `- ${f.field} = ${f.value}  [${f.trust}, ${f.source}]`).join('\n');
}

const SYSTEM = `You are a product-content writer for an ecommerce catalog. You rewrite a single product page for SEO + AEO (answer-engine optimization).

NON-NEGOTIABLE RULES (a separate verifier WILL reject violations):
1. GROUNDING: assert ONLY facts present in the provided FactsTable (tiers T1/T2). Never invent or estimate specs, dimensions, materials, weights (GSM/oz), certifications, awards, prices, or review counts.
2. GAPS: never assert anything listed under GAPS. If a buyer question maps to a gap, answer honestly that it is not specified.
3. NO em dashes anywhere (use a hyphen with spaces). No emojis in headings. Avoid the listed banned words.
4. Do NOT use a trademarked term as a generic product type.
5. Exactly ONE <h1>. Then sections in this order: a lead paragraph that passes the three-sentence test (who it is for / what problem it solves / how it is different), a "Who it is for" section, a short "What is <category>" explainer, an extractable Specs <table>, and an FAQ with real buyer questions answered in 2-4 sentences.
6. Body length 250-500 words. Plain language, specific, honest peer tone. No hard-sell.
7. JSON-LD: @type "Product", priceCurrency taken from the provided store currency (never assumed), additionalProperty built from facts. Include NO aggregateRating or review fields unless real review data exists in the FactsTable.

OUTPUT: reply with ONLY a JSON object: {"html": string, "metaTitle": string, "metaDescription": string, "slug": string, "jsonld": object}. metaTitle 50-60 chars (hard cap 62) with the primary keyword near the front; metaDescription <= 155 chars; slug <= 5 words, hyphenated.`;

export class AnthropicRewriter implements Rewriter {
  readonly id = 'anthropic-strong-rewrite-v1';
  private client: Anthropic;
  constructor(opts?: { client?: Anthropic; apiKey?: string }) {
    this.client = opts?.client ?? makeClient({ apiKey: opts?.apiKey });
  }

  async rewrite(input: RewriteInput): Promise<PieceDraft> {
    const sel = input.selection;
    const user = [
      `STORE CURRENCY: ${input.store.currency ?? 'USD'}`,
      `BRAND: ${input.vendorName}`,
      `BRAND VOICE: ${input.brandVoiceNote}`,
      `PRIMARY KEYWORD: ${sel.primary.candidate.keyword}`,
      `SECONDARY KEYWORDS: ${sel.secondaries.map((s) => s.candidate.keyword).join(', ') || '(none)'}`,
      `VARIANT TERMS (map color terms to these real shades, do not invent shades): ${sel.variantMap.map((v) => `${v.keyword} -> ${v.variantValue}`).join(', ') || '(none)'}`,
      `WORD TARGET: ${input.wordTarget.min}-${input.wordTarget.max} body words`,
      '',
      'FACTS TABLE (assert ONLY these; T1/T2 are trusted):',
      renderFacts(input.facts) || '(no trusted facts)',
      '',
      'GAPS (never assert these; answer honestly if asked):',
      input.gaps.length ? input.gaps.map((g) => `- ${g}`).join('\n') : '(none)',
    ].join('\n');

    const out = await structuredCall<RewriteJson>({
      client: this.client,
      tier: 'strong',
      system: SYSTEM,
      user,
      maxTokens: 4096,
      temperature: 0.5,
    });

    const meta: PieceMeta = {
      title: out.metaTitle ?? '',
      description: out.metaDescription ?? '',
      slug: out.slug ?? '',
    };
    return {
      html: out.html ?? '',
      meta,
      jsonld: out.jsonld ?? {},
      variantMap: sel.variantMap,
      rewriterId: this.id,
    };
  }
}
