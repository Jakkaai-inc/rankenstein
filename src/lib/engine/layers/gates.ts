// LAYER gates (code, required)
//
// Pure mechanical checks against the brand hard rules. One repair round is
// allowed: em dashes are stripped everywhere (body, meta, JSON-LD strings) and
// the gates re-evaluated. Anything still failing is a real violation.
//
// EM-DASH SCOPE: zero em dashes in ALL emitted content — body HTML, meta fields,
// JSON-LD strings, and preview chrome.

import type {
  BrandProfile,
  GateViolation,
  PieceDraft,
} from '../types';
import {
  countH1,
  findEmDashes,
  headingsWithEmoji,
  stripEmDashes,
  stripTags,
  wordCount,
} from '../html';

export type GateResult = {
  violations: GateViolation[];
  /** the draft after the (single) repair round. */
  draft: PieceDraft;
  repaired: boolean;
};

type WordTarget = { min: number; max: number };

/** Deep-strip em dashes from all string values in a JSON-LD object. */
function deEmDashJsonLd(obj: Record<string, unknown>): Record<string, unknown> {
  const walk = (v: unknown): unknown => {
    if (typeof v === 'string') return stripEmDashes(v);
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(v)) out[k] = walk(val);
      return out;
    }
    return v;
  };
  return walk(obj) as Record<string, unknown>;
}

function jsonLdStrings(obj: Record<string, unknown>): string {
  return JSON.stringify(obj);
}

function evaluate(draft: PieceDraft, brand: BrandProfile, wordTarget: WordTarget): GateViolation[] {
  const v: GateViolation[] = [];
  const ld = jsonLdStrings(draft.jsonld);
  const allText = `${draft.html}\n${draft.meta.title}\n${draft.meta.description}\n${ld}`;

  // em dash (anywhere)
  if (findEmDashes(allText)) {
    const where = [
      findEmDashes(draft.html) ? 'body' : null,
      findEmDashes(draft.meta.title) ? 'metaTitle' : null,
      findEmDashes(draft.meta.description) ? 'metaDesc' : null,
      findEmDashes(ld) ? 'jsonld' : null,
    ].filter(Boolean);
    v.push({ gate: 'em-dash', detail: `em dash (U+2014) present in: ${where.join(', ')}` });
  }

  // emoji in headings
  const emo = headingsWithEmoji(draft.html);
  if (emo.length) v.push({ gate: 'emoji-heading', detail: `emoji in heading(s): ${emo.join(' | ')}` });

  // banned words (visible body text + meta), word-boundaried, case-insensitive
  const visible = `${stripTags(draft.html)} ${draft.meta.title} ${draft.meta.description}`.toLowerCase();
  for (const w of brand.bannedWords) {
    const rx = new RegExp(`\\b${w.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
    if (rx.test(visible)) v.push({ gate: 'banned-word', detail: `banned word "${w}"` });
  }

  // exactly one h1
  const h1 = countH1(draft.html);
  if (h1 !== 1) v.push({ gate: 'h1-count', detail: `expected exactly 1 <h1>, found ${h1}` });

  // slug <= 5 words
  const slugWords = draft.meta.slug.split('-').filter(Boolean);
  if (slugWords.length > 5) v.push({ gate: 'slug-length', detail: `slug has ${slugWords.length} words (max 5)` });
  if (slugWords.length === 0) v.push({ gate: 'slug-length', detail: 'slug is empty' });

  // computed body word count within target window
  const wc = wordCount(draft.html);
  if (wc < wordTarget.min || wc > wordTarget.max) {
    v.push({ gate: 'word-count', detail: `body word count ${wc} outside target ${wordTarget.min}-${wordTarget.max}` });
  }

  // JSON-LD parses
  try {
    const round = JSON.parse(JSON.stringify(draft.jsonld));
    if (!round || typeof round !== 'object') v.push({ gate: 'jsonld-parse', detail: 'JSON-LD is not an object' });
  } catch {
    v.push({ gate: 'jsonld-parse', detail: 'JSON-LD failed to serialize/parse' });
  }

  // meta title length: target 50-60, hard cap 62
  const tlen = draft.meta.title.length;
  if (tlen > 62) v.push({ gate: 'meta-title-length', detail: `meta title ${tlen} chars (hard cap 62)` });
  if (tlen < 30) v.push({ gate: 'meta-title-length', detail: `meta title ${tlen} chars (too short)` });

  // meta description length <= 155
  const dlen = draft.meta.description.length;
  if (dlen > 155) v.push({ gate: 'meta-desc-length', detail: `meta description ${dlen} chars (max 155)` });

  return v;
}

export function runGates(
  draft: PieceDraft,
  brand: BrandProfile,
  wordTarget: WordTarget,
): GateResult {
  let violations = evaluate(draft, brand, wordTarget);
  let working = draft;
  let repaired = false;

  // single repair round: fix mechanically-repairable gates (em dash).
  if (violations.some((x) => x.gate === 'em-dash')) {
    working = {
      ...draft,
      html: stripEmDashes(draft.html),
      meta: {
        ...draft.meta,
        title: stripEmDashes(draft.meta.title),
        description: stripEmDashes(draft.meta.description),
      },
      jsonld: deEmDashJsonLd(draft.jsonld),
    };
    repaired = true;
    violations = evaluate(working, brand, wordTarget);
  }

  return { violations, draft: working, repaired };
}
