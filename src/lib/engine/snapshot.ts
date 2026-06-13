// Snapshot normalization — turn a raw Shopify storefront product (products.json
// shape) into the engine's NormalizedProduct. Pure; the file loader at the
// bottom is a thin test/demo convenience (the engine never auto-reads disk).

import { readFileSync } from 'node:fs';
import type { NormalizedProduct, NormalizedVariant } from './types.ts';

type RawVariant = {
  id: number | string;
  title: string;
  option1?: string | null;
  option2?: string | null;
  option3?: string | null;
  sku?: string | null;
  price?: string | number | null;
  compare_at_price?: string | number | null;
  available?: boolean;
  grams?: number | null;
};

type RawProduct = {
  id: number | string;
  title: string;
  handle: string;
  body_html?: string | null;
  vendor?: string | null;
  product_type?: string | null;
  tags?: string[] | string | null;
  options?: { name: string; values: string[] }[];
  variants?: RawVariant[];
  images?: unknown[];
};

function asPrice(v: string | number | null | undefined): string | null {
  if (v === null || v === undefined || v === '') return null;
  return String(v);
}

function normTags(tags: RawProduct['tags']): string[] {
  if (Array.isArray(tags)) return tags.map((t) => String(t));
  if (typeof tags === 'string') return tags.split(',').map((t) => t.trim()).filter(Boolean);
  return [];
}

export function normalizeProduct(raw: RawProduct): NormalizedProduct {
  const variants: NormalizedVariant[] = (raw.variants ?? []).map((v) => ({
    id: v.id,
    title: v.title,
    option1: v.option1 ?? null,
    option2: v.option2 ?? null,
    option3: v.option3 ?? null,
    sku: v.sku ?? null,
    price: asPrice(v.price),
    compareAtPrice: asPrice(v.compare_at_price),
    available: Boolean(v.available),
    grams: typeof v.grams === 'number' ? v.grams : null,
  }));

  return {
    id: raw.id,
    title: raw.title,
    handle: raw.handle,
    bodyHtml: raw.body_html ?? '',
    vendor: raw.vendor ?? '',
    productType: raw.product_type ?? '',
    tags: normTags(raw.tags),
    options: (raw.options ?? []).map((o) => ({ name: o.name, values: o.values ?? [] })),
    variants,
    imageCount: Array.isArray(raw.images) ? raw.images.length : 0,
  };
}

export type Snapshot = {
  exported_at?: string;
  source?: string;
  products: RawProduct[];
};

/** Load and parse a snapshot file (test/demo helper). */
export function loadSnapshot(path: string): Snapshot {
  const txt = readFileSync(path, 'utf8');
  return JSON.parse(txt) as Snapshot;
}

/** Find a raw product by id or by case-insensitive title substring. */
export function findRaw(snap: Snapshot, idOrTitle: number | string): RawProduct | undefined {
  const byId = snap.products.find((p) => String(p.id) === String(idOrTitle));
  if (byId) return byId;
  const needle = String(idOrTitle).toLowerCase();
  return snap.products.find((p) => p.title.toLowerCase().includes(needle));
}
