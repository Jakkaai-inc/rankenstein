// Live strong-tier article drafter. Writes semantic HTML from the outline, with
// an inline citation for EVERY external factual claim/number. The drafter may
// propose its own sources from knowledge; citation-verify (fetch + agent) then
// validates each one and BLOCKS on any that fail, so hallucinated/dead URLs are
// caught downstream.

import Anthropic from '@anthropic-ai/sdk';
import type { ArticleDraft, Citation, CitationTopic, ImageSlot, PieceMeta } from '../types';
import type { ArticleDrafter, ArticleDraftInput } from '../providers';
import { makeClient, structuredCall } from './anthropic';

const PLACEHOLDER_SRC = '/rankenstein-placeholder.svg';

type DraftJson = {
  html: string;
  metaTitle: string;
  metaDesc: string;
  slug: string;
  jsonld: Record<string, unknown>;
  citations?: { url: string; anchor: string; claim: string; topic?: string }[];
  images?: { prompt: string; alt: string; title: string; src?: string }[];
};

const VALID_TOPIC: CitationTopic[] = ['general', 'health', 'finance', 'legal'];

const SYSTEM = `You are a writer producing an SEO+AEO article as semantic HTML from an outline.

RULES (a verifier WILL reject violations):
1. Exactly one <h1>. Follow the outline's sections (<h2> + prose + bullets) and end with an FAQ.
2. CITATIONS: every external factual claim or statistic must be wrapped in an inline <a href="..."> with descriptive anchor text. Record each in the citations array with the exact claim. Internal brand facts (provided in FACTS) are stated directly without a citation. Never state a number that is neither an internal fact nor inline-cited.
3. No em dashes (use hyphens). No emojis in headings.
4. Images: include 1-2 <figure> with <img> that has a non-empty src (use "${PLACEHOLDER_SRC}" if you have no real asset), alt, title, and a data-image-prompt attribute.
5. JSON-LD must be an @graph with an "Article" and a "FAQPage"; never include aggregateRating.

OUTPUT: reply with ONLY JSON: {"html":string,"metaTitle":string,"metaDesc":string,"slug":string,"jsonld":object,"citations":[{"url":string,"anchor":string,"claim":string,"topic":"general"|"health"|"finance"|"legal"}],"images":[{"prompt":string,"alt":string,"title":string,"src":string}]}.`;

export class AnthropicArticleDrafter implements ArticleDrafter {
  readonly id = 'anthropic-strong-article-v1';
  private client: Anthropic;
  constructor(opts?: { client?: Anthropic; apiKey?: string }) {
    this.client = opts?.client ?? makeClient({ apiKey: opts?.apiKey });
  }

  async draft(input: ArticleDraftInput): Promise<ArticleDraft> {
    const factLines = input.facts.filter((f) => f.trust !== 'T3').map((f) => `- ${f.field} = ${f.value}`).join('\n') || '(none)';
    const sourceLines = (input.sources ?? []).map((s) => `- ${s.url} (${s.topic ?? 'general'}): ${s.claim ?? ''}`).join('\n') || '(none provided; propose reputable sources)';
    const user = [
      `BRAND: ${input.vendorName}`,
      `VOICE: ${input.brandVoiceNote}`,
      `OUTLINE:\n${JSON.stringify(input.outline)}`,
      `INTERNAL FACTS (state directly, no citation):\n${factLines}`,
      `CANDIDATE SOURCES (cite if used):\n${sourceLines}`,
    ].join('\n\n');

    const out = await structuredCall<DraftJson>({ client: this.client, tier: 'strong', system: SYSTEM, user, maxTokens: 4096 });

    const citations: Citation[] = (out.citations ?? []).map((c) => ({
      url: c.url,
      anchor: c.anchor,
      claim: c.claim,
      topic: (VALID_TOPIC as string[]).includes(c.topic ?? '') ? (c.topic as CitationTopic) : 'general',
    }));
    const images: ImageSlot[] = (out.images ?? []).map((im) => ({
      prompt: im.prompt,
      alt: im.alt,
      title: im.title,
      src: im.src && im.src.trim() ? im.src : PLACEHOLDER_SRC, // never empty
    }));
    const meta: PieceMeta = { title: out.metaTitle ?? input.outline.metaTitle, description: out.metaDesc ?? input.outline.metaDesc, slug: out.slug ?? input.outline.slug };

    return { html: out.html ?? '', meta, jsonld: out.jsonld ?? {}, citations, images, drafterId: this.id };
  }
}
