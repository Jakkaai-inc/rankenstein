// LAYER draft (agent strong-tier + web, required - articles)
//
// Two ArticleDrafter strategies behind one interface:
//   - templateArticleDrafter: grounded + cited BY CONSTRUCTION. Internal brand
//     facts are stated directly; every external stat is wrapped in an inline
//     citation whose claim text carries the number, so gradeArticle traces it.
//   - naiveArticleDrafter: emits an UNCITED statistic to prove citation-verify +
//     the article verifier catch it (the demo gotcha).
//
// Images are visible <figure> placeholders with data-image-prompt and a non-empty
// src (never empty), per the contract.

import type { ArticleDraft, ArticleFaq, Citation, ImageSlot, Outline, PieceMeta } from '../types';
import type { ArticleDrafter, ArticleDraftInput, ArticleSource } from '../providers';
import { escapeHtml } from '../html';

const PLACEHOLDER_SRC = '/rankenstein-placeholder.svg';

function faqHtml(faqs: ArticleFaq[]): string {
  if (!faqs.length) return '';
  return (
    `<h2>FAQ</h2>` +
    faqs.map((f) => `<p><strong>${escapeHtml(f.q)}</strong> ${escapeHtml(f.a)}</p>`).join('')
  );
}

function imageFigure(slot: ImageSlot): string {
  return (
    `<figure><img src="${escapeHtml(slot.src ?? PLACEHOLDER_SRC)}" alt="${escapeHtml(slot.alt)}" ` +
    `title="${escapeHtml(slot.title)}" data-image-prompt="${escapeHtml(slot.prompt)}">` +
    `<figcaption>${escapeHtml(slot.alt)}</figcaption></figure>`
  );
}

function articleJsonLd(outline: Outline, vendor: string): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Article',
        headline: outline.title,
        description: outline.metaDesc,
        author: { '@type': 'Organization', name: vendor },
        publisher: { '@type': 'Organization', name: vendor },
      },
      {
        '@type': 'FAQPage',
        mainEntity: outline.faqs.map((f) => ({
          '@type': 'Question',
          name: f.q,
          acceptedAnswer: { '@type': 'Answer', text: f.a },
        })),
      },
    ],
  };
}

function meta(outline: Outline): PieceMeta {
  return { title: outline.metaTitle, description: outline.metaDesc, slug: outline.slug };
}

/** Build a cited sentence + its Citation from a source that carries a claim. */
function citedSentence(src: ArticleSource): { html: string; citation: Citation } | null {
  if (!src.claim) return null;
  const anchor = src.title ?? new URL(src.url).hostname;
  const citation: Citation = { url: src.url, anchor, claim: src.claim, topic: src.topic ?? 'general' };
  const html = `<p>${escapeHtml(src.claim)} (<a href="${escapeHtml(src.url)}">${escapeHtml(anchor)}</a>)</p>`;
  return { html, citation };
}

class TemplateArticleDrafter implements ArticleDrafter {
  readonly id = 'template-article-grounded-v1';

  async draft(input: ArticleDraftInput): Promise<ArticleDraft> {
    const { outline, vendorName } = input;
    const citations: Citation[] = [];
    const sources = (input.sources ?? []).filter((s) => s.claim);

    const sections = outline.sections
      .map((s, i) => {
        let block = `<h2>${escapeHtml(s.h2)}</h2><p>${escapeHtml(s.reason)}</p>`;
        if (s.bullets.length) block += `<ul>${s.bullets.map((b) => `<li>${escapeHtml(b)}</li>`).join('')}</ul>`;
        // attach one cited stat per section, cycling through available sources
        const src = sources[i];
        if (src) {
          const c = citedSentence(src);
          if (c) {
            block += c.html;
            citations.push(c.citation);
          }
        }
        return block;
      })
      .join('');

    // any leftover sources get their own evidence paragraph so all are linked
    let evidence = '';
    for (let i = outline.sections.length; i < sources.length; i++) {
      const c = citedSentence(sources[i]);
      if (c) {
        evidence += c.html;
        citations.push(c.citation);
      }
    }

    const image: ImageSlot = {
      prompt: `Editorial hero image for an article titled "${outline.title}", soft natural light, flat-lay of fabric swatches`,
      alt: outline.title,
      title: outline.title,
      src: PLACEHOLDER_SRC,
    };

    const html =
      `<h1>${escapeHtml(outline.title)}</h1>` +
      `<p>${escapeHtml(outline.hook)}</p>` +
      imageFigure(image) +
      sections +
      evidence +
      faqHtml(outline.faqs);

    return {
      html,
      meta: meta(outline),
      jsonld: articleJsonLd(outline, vendorName),
      citations,
      images: [image],
      drafterId: this.id,
    };
  }
}

class NaiveArticleDrafter implements ArticleDrafter {
  readonly id = 'naive-article-uncited-demo';

  async draft(input: ArticleDraftInput): Promise<ArticleDraft> {
    const { outline, vendorName } = input;
    // structurally fine, but asserts an UNCITED statistic (73%) -> A1 fails.
    const html =
      `<h1>${escapeHtml(outline.title)}</h1>` +
      `<p>${escapeHtml(outline.hook)}</p>` +
      `<h2>Why it matters</h2><p>Studies show 73% of quilters prefer minky for baby blankets, and demand keeps rising.</p>` +
      outline.sections.map((s) => `<h2>${escapeHtml(s.h2)}</h2><p>${escapeHtml(s.reason)}</p>`).join('') +
      faqHtml(outline.faqs);

    return {
      html,
      meta: meta(outline),
      jsonld: articleJsonLd(outline, vendorName),
      citations: [], // nothing cited -> the 73% stat is ungrounded
      images: [],
      drafterId: this.id,
    };
  }
}

export const templateArticleDrafter = new TemplateArticleDrafter();
export const naiveArticleDrafter = new NaiveArticleDrafter();
