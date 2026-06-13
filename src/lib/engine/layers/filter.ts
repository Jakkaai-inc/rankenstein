// LAYER filter (code, required)
//
// Deterministic keyword triage for the PRODUCT-REWRITE path. Rules in code,
// never a model. Drops/routes:
//   - head/category terms (they belong to collection PLPs)   [A5]
//   - sibling-SKU terms (other products: prints, dots, lines) [cannibalization]
//   - competitor-brand terms
//   - near-me terms
//
// HEAD-TERM DEFINITION (operational, per LAYER-CONTRACTS):
//   a keyword is head/category iff, after removing stopwords and the store's
//   vertical noun(s) (e.g. "fabric"), it token-matches >= max(8, 25% of catalog)
//   products OR equals a product type / collection title. Computed from the
//   catalog index — never a model judgment. Head terms are dropped ONLY when
//   their intent is transactional/commercial (those compete with collections);
//   informational head terms ("what is minky fabric") are kept for the FAQ.

import type {
  CatalogIndex,
} from '../catalog';
import { countMatching, productTokens, tokenize } from '../catalog';
import type {
  DropReason,
  FilterResult,
  KeywordCandidate,
  NormalizedProduct,
} from '../types';

export type FilterConfig = {
  /** non-distinguishing nouns stripped before head/sibling analysis. */
  verticalNouns: string[];
  /** descriptor tokens that mark OTHER products (prints, patterns, product lines). */
  patternTokens: string[];
  /** competitor / marketplace brand tokens. */
  competitorBrands: string[];
  /** min catalog doc-frequency for a non-this token to count as sibling-SKU. */
  siblingMinFreq: number;
};

export const EZ_FABRIC_FILTER_CONFIG: FilterConfig = {
  verticalNouns: ['fabric', 'material'],
  patternTokens: [
    'print', 'printed', 'dot', 'dotted', 'floral', 'dinosaur', 'tie', 'dye',
    'tiedye', 'damask', 'spotted', 'camo', 'plaid', 'stripe', 'striped',
    'leopard', 'cheetah', 'animal', 'geometric', 'snuggle', 'whispy',
    'frosted', 'tonal', 'pattern', 'paisley', 'rainbow', 'galaxy',
  ],
  competitorBrands: [
    'shannon', 'joann', 'joanns', 'hobby', 'lobby', 'walmart', 'amazon',
    'etsy', 'spoonflower', 'mood', 'fabriccom', 'minkycouture',
  ],
  siblingMinFreq: 2,
};

const NEAR_ME_RE = /\bnear me\b/i;
const SKU_RE = /\b[A-Z]{2,}-[A-Z0-9-]{3,}\b/; // looks like a SKU code

function reduce(keyword: string, verticalNouns: string[]): string[] {
  const vn = new Set(verticalNouns.map((v) => v.toLowerCase()));
  return tokenize(keyword).filter((t) => !vn.has(t));
}

function isTransactionalish(intent: KeywordCandidate['intent']): boolean {
  return intent === 'transactional' || intent === 'commercial';
}

export function filterKeywords(
  candidates: KeywordCandidate[],
  index: CatalogIndex,
  target: NormalizedProduct,
  config: FilterConfig = EZ_FABRIC_FILTER_CONFIG,
): FilterResult {
  const kept: KeywordCandidate[] = [];
  const dropped: FilterResult['dropped'] = [];

  const vn = new Set(config.verticalNouns.map((v) => v.toLowerCase()));
  const patterns = new Set(config.patternTokens.map((t) => t.toLowerCase()));
  const competitors = new Set(config.competitorBrands.map((t) => t.toLowerCase()));
  const thisTokens = new Set([...productTokens(target)].filter((t) => !vn.has(t)));

  const drop = (candidate: KeywordCandidate, reason: DropReason, detail: string) =>
    dropped.push({ candidate, reason, detail });

  for (const c of candidates) {
    const toks = tokenize(c.keyword);
    const reduced = reduce(c.keyword, config.verticalNouns);

    // 1. near-me
    if (NEAR_ME_RE.test(c.keyword)) {
      drop(c, 'near-me', 'Local-intent term; not relevant to a national catalog page.');
      continue;
    }

    // 2. competitor / marketplace brand
    const competitorHit = toks.find((t) => competitors.has(t));
    if (competitorHit) {
      drop(c, 'competitor-brand', `Contains competitor/marketplace token "${competitorHit}".`);
      continue;
    }

    // 3. SKU/PLP pattern
    if (SKU_RE.test(c.keyword)) {
      drop(c, 'plp-or-sku-pattern', 'Looks like a SKU/PLP code, not a buyer query.');
      continue;
    }

    // 4. sibling-SKU: a token that marks a DIFFERENT product and is not ours.
    const siblingTok = toks.find(
      (t) =>
        !thisTokens.has(t) &&
        !vn.has(t) &&
        (patterns.has(t) || (index.tokenFreq.get(t) ?? 0) >= config.siblingMinFreq),
    );
    if (siblingTok) {
      drop(
        c,
        'sibling-sku',
        `"${siblingTok}" describes a different product (print/pattern/line). Route to that listing to avoid self-cannibalization.`,
      );
      continue;
    }

    // 5. head/category
    const phrase = reduced.join(' ');
    const matchCount = countMatching(index, reduced);
    const isHead =
      index.productTypes.has(phrase) ||
      index.productTypes.has(c.keyword.toLowerCase().trim()) ||
      matchCount >= index.headThreshold;
    if (isHead && isTransactionalish(c.intent)) {
      drop(
        c,
        'head-or-category',
        `Head/category term (matches ${matchCount} products; threshold ${index.headThreshold}). ` +
          `Belongs to a collection page, not a single product. Routed to category/collection.`,
      );
      continue;
    }

    kept.push(c);
  }

  return { kept, dropped };
}
