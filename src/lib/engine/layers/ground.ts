// LAYER ground (code+fetch, required)
//
// Builds the FactsTable — the ONLY permissible claim source for everything
// downstream. Provenance tiers:
//   T1  structured fields (variants, options, prices, type, tags, shop settings)
//   T2  spec-formatted "key: value" lines inside body_html ("merchant-stated")
//   T3  prose claims inside body_html — UNVERIFIED; flagged, never asserted
// Pasted AI-chat artifacts demote the WHOLE body_html to T3 + a provenance flag.
//
// HARD STOP: refuses to run unless the brand profile is confirmed (no degraded
// mode in automated runs).

import type {
  BrandProfile,
  FactRows,
  FactsRow,
  Gap,
  GroundResult,
  GuardrailFlag,
  NormalizedProduct,
  SiteAuthority,
  StoreContext,
} from '../types';
import { decodeEntities, extractSpecLines, scanArtifacts, stripTags } from '../html';

export class BrandUnconfirmedError extends Error {
  constructor(brandName: string) {
    super(
      `HARD STOP: brand profile "${brandName}" is not confirmed. ` +
        `Generation is blocked until a human confirms the brand guidelines.`,
    );
    this.name = 'BrandUnconfirmedError';
  }
}

export type GroundInput = {
  product: NormalizedProduct;
  brand: BrandProfile;
  /** shop settings (currency/locale/domain). In live runs ground fetches these. */
  store?: Partial<StoreContext>;
  /** site authority from provider; default conservative web-estimate (low). */
  authority?: SiteAuthority;
};

// Unit-option detection: option values that read as "how it's sold".
const UNIT_VALUE_RE = /\b(per yard|yard|bolt|roll|half roll|fat quarter|meter|metre|each)\b/i;
// Care text that implies a missing ironing instruction.
const IRON_RE = /\biron(ing)?\b/i;
// A "true weight" signal (GSM or oz). "3mm" pile height does NOT count.
const TRUE_WEIGHT_RE = /\b\d+(\.\d+)?\s*(gsm|g\/m2|g\/m²|oz|ounce)\b/i;

/** Map a merchant spec label to a canonical FactsTable field. null = ignore. */
function canonicalField(label: string): string | null {
  const l = label.toLowerCase();
  if (/^contents?$|^material$|^fabric$|^composition$/.test(l)) return 'material';
  if (/^width$/.test(l)) return 'width';
  if (/^care$|^washing$|^wash$/.test(l)) return 'care';
  if (/^weight$/.test(l)) return 'weight.stated';
  if (/^pile$/.test(l)) return 'pile';
  if (/^length$/.test(l)) return 'length';
  return null;
}

function num(s: string | null): number | null {
  if (s == null) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function groundProduct(input: GroundInput): GroundResult {
  const { product, brand } = input;
  if (!brand.confirmed) throw new BrandUnconfirmedError(brand.name);

  const store: StoreContext = {
    currency: input.store?.currency ?? 'USD',
    locale: input.store?.locale ?? 'en-US',
    primaryDomain: input.store?.primaryDomain ?? brand.primaryDomain,
  };
  const authority: SiteAuthority = input.authority ?? { dr: null, source: 'web-estimate' };

  const facts: FactRows = [];
  const gaps: Gap[] = [];
  const provenanceFlags: GuardrailFlag[] = [];

  // ---- T1: structured fields ------------------------------------------------
  facts.push({ field: 'title', value: product.title, source: 'product.title', trust: 'T1' });
  facts.push({ field: 'productType', value: product.productType, source: 'product.product_type', trust: 'T1' });
  facts.push({ field: 'brand', value: brand.vendorName, source: 'product.vendor', trust: 'T1' });

  // Options → color set + sold-as units (kept verbatim; abbreviations NOT expanded).
  let unitOptionName: string | null = null;
  for (const opt of product.options) {
    const looksLikeUnit = opt.values.some((v) => UNIT_VALUE_RE.test(v)) || /unit|size/i.test(opt.name);
    if (looksLikeUnit) {
      unitOptionName = opt.name;
      facts.push({
        field: 'soldAs',
        value: opt.values.join(', '),
        source: `options.${opt.name}`,
        trust: 'T1',
      });
    } else {
      facts.push({
        field: `option.${opt.name}`,
        value: opt.values.join(', '),
        source: `options.${opt.name}`,
        trust: 'T1',
      });
      if (/colou?r/i.test(opt.name)) {
        facts.push({
          field: 'colorCount',
          value: String(opt.values.length),
          source: `options.${opt.name}`,
          trust: 'T1',
        });
      }
    }
  }

  // Prices: low/high across all variants + a representative price per unit.
  const prices = product.variants.map((v) => num(v.price)).filter((n): n is number => n != null);
  if (prices.length) {
    const low = Math.min(...prices);
    const high = Math.max(...prices);
    facts.push({ field: 'price.low', value: low.toFixed(2), source: 'variants[].price', trust: 'T1' });
    facts.push({ field: 'price.high', value: high.toFixed(2), source: 'variants[].price', trust: 'T1' });
  } else {
    gaps.push({ field: 'price', note: 'No variant prices in source.' });
  }
  if (unitOptionName) {
    const unitIdx = product.options.findIndex((o) => o.name === unitOptionName);
    const optKey = (`option${unitIdx + 1}`) as 'option1' | 'option2' | 'option3';
    const byUnit = new Map<string, number[]>();
    for (const v of product.variants) {
      const unit = v[optKey];
      const p = num(v.price);
      if (unit && p != null) {
        if (!byUnit.has(unit)) byUnit.set(unit, []);
        byUnit.get(unit)!.push(p);
      }
    }
    for (const [unit, ps] of byUnit) {
      facts.push({
        field: `price.${slugUnit(unit)}`,
        value: Math.min(...ps).toFixed(2),
        source: `variants[].price where ${unitOptionName}=${unit} (${unit})`,
        trust: 'T1',
      });
    }
  }

  // Availability: count of in-stock variants.
  const inStock = product.variants.filter((v) => v.available).length;
  facts.push({
    field: 'availability',
    value: `${inStock}/${product.variants.length} variants in stock`,
    source: 'variants[].available',
    trust: 'T1',
  });
  facts.push({ field: 'variantCount', value: String(product.variants.length), source: 'variants', trust: 'T1' });

  // Real review data? (controls aggregateRating). Storefront snapshot has none.
  facts.push({ field: 'reviews.present', value: 'false', source: 'product (no review fields)', trust: 'T1' });

  // ---- body_html: artifact scan, then T2 specs / T3 prose -------------------
  const artifact = scanArtifacts(product.bodyHtml);
  if (artifact.found) {
    provenanceFlags.push({
      type: 'provenance',
      severity: 'WARN',
      note:
        `body_html contains pasted AI-chat artifacts (${artifact.hits.join(', ')}). ` +
        `The entire description is demoted to T3 (unverified) and not used as a fact source. ` +
        `Specs were re-derived from structured fields only; missing specs are listed as gaps.`,
    });
    // whole body is T3: store as a single demoted-prose row (never asserted).
    const prose = stripTags(product.bodyHtml);
    if (prose) {
      facts.push({
        field: 'prose',
        value: prose.slice(0, 600),
        source: 'body_html:artifact-demoted',
        trust: 'T3',
      });
    }
  } else {
    // T2: spec-formatted lines.
    for (const line of extractSpecLines(product.bodyHtml)) {
      const field = canonicalField(line.label);
      if (!field) continue;
      facts.push({
        field,
        value: line.value,
        source: `body_html:spec-line "${line.label}" (merchant-stated)`,
        trust: 'T2',
      });
    }
    // T3: remaining prose (the non-list narrative), captured but never asserted.
    const prose = extractProse(product.bodyHtml);
    for (const sentence of prose) {
      facts.push({ field: 'prose', value: sentence, source: 'body_html:prose', trust: 'T3' });
    }
  }

  // ---- gaps: expected fabric attributes that are missing/under-specified ----
  const has = (field: string) => facts.some((f) => f.field === field && (f.trust === 'T1' || f.trust === 'T2'));

  if (!has('material')) gaps.push({ field: 'material', note: 'Material/contents not available as a trusted fact (body demoted or absent). Ask merchant.' });
  if (!has('width')) gaps.push({ field: 'width', note: 'Width not available as a trusted fact. Ask merchant.' });
  if (!has('care')) gaps.push({ field: 'care', note: 'Care instructions not available as a trusted fact. Ask merchant.' });

  // True fabric weight (GSM/oz): a stated "3mm" is pile height, not weight.
  const statedWeight = facts.find((f) => f.field === 'weight.stated');
  const hasTrueWeight = facts.some((f) => (f.field === 'weight.gsm') || (statedWeight && TRUE_WEIGHT_RE.test(statedWeight.value)));
  if (!hasTrueWeight) {
    const note = statedWeight
      ? `Source lists "${statedWeight.value}" as weight, which is a pile height, not GSM/oz. True fabric weight is missing. Ask merchant.`
      : 'Fabric weight (GSM/oz) is missing. Ask merchant.';
    gaps.push({ field: 'weight.gsm', note });
  }

  // Ironing: a real buyer question; flag if care says nothing about ironing.
  const care = facts.find((f) => f.field === 'care');
  if (!care || !IRON_RE.test(care.value)) {
    gaps.push({
      field: 'care.ironing',
      note: 'Care label says nothing about ironing. Polyester pile is heat-sensitive; left unanswered rather than guessed.',
    });
  }

  return { facts, gaps, store, authority, provenanceFlags, product };
}

function slugUnit(unit: string): string {
  return unit
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Pull narrative sentences (non-list prose) from a body for T3 capture. */
function extractProse(html: string): string[] {
  // remove list blocks, keep paragraph text
  const noLists = html.replace(/<ul[\s\S]*?<\/ul>|<ol[\s\S]*?<\/ol>/gi, ' ');
  const text = decodeEntities(stripTags(noLists));
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 12)
    .slice(0, 6);
}

/** Convenience: a default StoreContext for a brand (offline). */
export function defaultStore(brand: BrandProfile): StoreContext {
  return { currency: 'USD', locale: 'en-US', primaryDomain: brand.primaryDomain };
}

/** Look up a single trusted fact value (T1/T2) by field; null if not grounded. */
export function trustedFact(facts: FactRows, field: string): FactsRow | null {
  return facts.find((f) => f.field === field && (f.trust === 'T1' || f.trust === 'T2')) ?? null;
}
