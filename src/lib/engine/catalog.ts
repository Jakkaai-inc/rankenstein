// Catalog index — the deterministic substrate the filter layer reasons over.
//
// Built once from the catalog (snapshot or live). It answers, without any model:
//   - how many products a keyword token-matches (head-term rule)
//   - the set of product types / collection-ish titles
//   - which descriptor tokens belong to OTHER products (sibling-SKU rule)

import type { NormalizedProduct } from './types';

const STOPWORDS = new Set([
  'the', 'a', 'an', 'of', 'for', 'and', 'or', 'to', 'in', 'on', 'with', 'by',
  'is', 'are', 'what', 'how', 'best', 'my', 'your', 'this', 'that', 'it',
]);

/** Tokenize to lowercase alnum tokens, drop stopwords + length<2, singularize. */
export function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map(singularize)
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));
}

function singularize(t: string): string {
  if (t.length > 4 && t.endsWith('es')) return t.slice(0, -2);
  if (t.length > 3 && t.endsWith('s') && !t.endsWith('ss')) return t.slice(0, -1);
  return t;
}

export type CatalogIndex = {
  productCount: number;
  /** token → set of product indices whose (title+type+tags) contain it */
  inverted: Map<string, Set<number>>;
  /** lowercased product types (proxy for collection titles in the snapshot) */
  productTypes: Set<string>;
  /** every descriptor token seen across the catalog, with doc frequency */
  tokenFreq: Map<string, number>;
  /** the head-term threshold: max(8, ceil(0.25 * productCount)) */
  headThreshold: number;
};

export function buildCatalogIndex(products: NormalizedProduct[]): CatalogIndex {
  const inverted = new Map<string, Set<number>>();
  const productTypes = new Set<string>();
  const tokenFreq = new Map<string, number>();

  products.forEach((p, i) => {
    if (p.productType) productTypes.add(p.productType.toLowerCase().trim());
    const text = [p.title, p.productType, ...p.tags].join(' ');
    const toks = new Set(tokenize(text));
    for (const t of toks) {
      if (!inverted.has(t)) inverted.set(t, new Set());
      inverted.get(t)!.add(i);
      tokenFreq.set(t, (tokenFreq.get(t) ?? 0) + 1);
    }
  });

  const headThreshold = Math.max(8, Math.ceil(0.25 * products.length));
  return { productCount: products.length, inverted, productTypes, tokenFreq, headThreshold };
}

/** Count products whose (title+type+tags) contain ALL given tokens. */
export function countMatching(index: CatalogIndex, tokens: string[]): number {
  if (tokens.length === 0) return index.productCount; // empty reduced phrase = everything
  let acc: Set<number> | null = null;
  for (const t of tokens) {
    const set = index.inverted.get(t);
    if (!set) return 0;
    if (acc === null) acc = new Set(set);
    else {
      const prev: Set<number> = acc;
      acc = new Set(Array.from(prev).filter((x) => set.has(x)));
    }
    if (acc.size === 0) return 0;
  }
  return acc ? acc.size : 0;
}

/** The descriptor token-set for one product (its own identity tokens). */
export function productTokens(p: NormalizedProduct): Set<string> {
  const text = [p.title, p.productType, ...p.tags, ...p.options.flatMap((o) => o.values)].join(' ');
  return new Set(tokenize(text));
}
