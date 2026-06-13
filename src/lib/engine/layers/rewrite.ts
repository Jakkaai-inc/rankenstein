// LAYER rewrite (strong-tier agent in prod; deterministic strategies here)
//
// Two Rewriter implementations behind one interface:
//   - templateRewriter: grounded BY CONSTRUCTION. Every emitted spec/number is
//     pulled from a T1/T2 fact. Structure matches reference-output-minky-preview.
//   - naiveRewriter: simulates a careless LLM that reuses T3 prose, invents a
//     GSM, and fabricates reviews. It exists ONLY to prove the guardrails + gates
//     + verifier catch ungrounded output (the demo's "gotcha" moment).
//
// In production the strong-tier agent slots in here with the SAME downstream
// guardrails/gates/verifier, so an agent that invents a claim gets caught too.

import type {
  FactRows,
  FactsRow,
  PieceDraft,
  PieceMeta,
} from '../types';
import type { Rewriter, RewriteInput } from '../providers';
import { escapeHtml } from '../html';

// ---- fact lookup ----------------------------------------------------------

type FactMap = Map<string, FactsRow>;

/** Highest-trust (T1 > T2) value per field; T3 is never included (unassertable). */
function buildFactMap(facts: FactRows): FactMap {
  const order = { T1: 0, T2: 1, T3: 2 } as const;
  const m: FactMap = new Map();
  for (const f of facts) {
    if (f.trust === 'T3') continue;
    const cur = m.get(f.field);
    if (!cur || order[f.trust] < order[cur.trust]) m.set(f.field, f);
  }
  return m;
}

function val(m: FactMap, field: string): string | null {
  return m.get(field)?.value ?? null;
}

function titleCase(s: string): string {
  const small = new Set(['by', 'the', 'for', 'of', 'and', 'a', 'an', 'in', 'on']);
  return s
    .split(/\s+/)
    .map((w, i) => (i > 0 && small.has(w.toLowerCase()) ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}

function slugify(s: string, maxWords = 5): string {
  const stop = new Set(['by', 'the', 'for', 'of', 'and', 'a', 'an', 'in', 'on', 'to']);
  return s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t && !stop.has(t))
    .slice(0, maxWords)
    .join('-');
}

/** Clamp a meta title toward 50-60 chars, hard cap 62, keep keyword at front. */
function buildMetaTitle(primaryKw: string, vendorShort: string, descriptor: string): string {
  const front = titleCase(primaryKw);
  const candidates = [
    `${front}, ${descriptor} | ${vendorShort}`,
    `${front} | ${vendorShort}`,
    front,
  ];
  for (const c of candidates) if (c.length <= 60) return c;
  // last resort: hard cap 62
  const c = candidates[0];
  return c.length <= 62 ? c : c.slice(0, 62).trimEnd();
}

function clamp(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).replace(/[\s,;]+\S*$/, '').trimEnd();
}

// ---- grounded template rewriter -------------------------------------------

class TemplateRewriter implements Rewriter {
  readonly id = 'template-grounded-v1';

  async rewrite(input: RewriteInput): Promise<PieceDraft> {
    const m = buildFactMap(input.facts);
    const primaryKw = input.selection.primary.candidate.keyword;
    const vendorShort = input.vendorName.replace(/^Touch Textiles by\s*/i, '').trim() || input.vendorName;

    const title = val(m, 'title') ?? primaryKw;
    const material = val(m, 'material');
    const width = val(m, 'width');
    const care = val(m, 'care');
    const pile = val(m, 'pile') ?? val(m, 'weight.stated');
    const soldAs = val(m, 'soldAs');
    const colorCount = val(m, 'colorCount');
    const colorList = val(m, 'option.Color');
    const priceYard = val(m, 'price.per-yard');
    const priceLow = val(m, 'price.low');
    const priceHigh = val(m, 'price.high');

    const descriptorBits = [pile ? `${pile} pile` : null, width ? `${width} wide` : null].filter(Boolean);
    const descriptor = (descriptorBits[0] ?? 'smooth minky').toString();

    // ---- lead: three-sentence test (who / what / how different) -----------
    const leadParts: string[] = [];
    // S1 who/what
    leadParts.push(
      `${titleCase(primaryKw)}: this is ${escapeHtml(vendorShort)}'s ${escapeHtml(title)}` +
        (colorCount ? `, sold in ${colorCount} shades` : '') +
        (width ? ` on a ${escapeHtml(width)} width.` : '.'),
    );
    // S2 what problem / material
    if (material) {
      leadParts.push(
        `It is a ${escapeHtml(material)} fabric` +
          (pile ? ` with a ${escapeHtml(pile)} pile` : '') +
          (care && /wash/i.test(care) ? `, machine washable, so it suits items that get handled and laundered often.` : '.'),
      );
    } else {
      leadParts.push(
        `Material and dimensions for this listing are not yet confirmed in the source data, so they are flagged for the merchant rather than guessed.`,
      );
    }
    // S3 how different (suitability from verified attributes, not user claims)
    const diffBits: string[] = [];
    if (width) diffBits.push(`the ${escapeHtml(width)} width covers a throw-size project with fewer seams`);
    if (soldAs) diffBits.push(`it is sold ${escapeHtml(soldAs.toLowerCase())}, so you can buy a single project or volume`);
    if (diffBits.length) leadParts.push(`What sets this listing apart: ${diffBits.join(', and ')}.`);

    const lead = `<p>${leadParts.join(' ')}</p>`;

    // ---- who it's for (suitability derived from verified attributes) -------
    const whoBullets: string[] = [];
    if (width) whoBullets.push(`Projects that need width: a single ${escapeHtml(width)} cut covers most throw-size pieces with fewer seams.`);
    if (care && /wash/i.test(care)) whoBullets.push(`Items washed often: the care label says ${escapeHtml(care.toLowerCase())}.`);
    if (soldAs) whoBullets.push(`Single makes or bulk runs: available ${escapeHtml(soldAs.toLowerCase())}.`);
    if (colorCount) whoBullets.push(`Color matching: ${colorCount} shades in this listing${colorList ? ` (${escapeHtml(colorList)})` : ''}.`);
    const whoSection = whoBullets.length
      ? `<h2>Who it is for and what to consider</h2><ul>${whoBullets.map((b) => `<li>${b}</li>`).join('')}</ul>`
      : '';

    // ---- explainer (grounded; only states what facts support) -------------
    const explainerParts: string[] = [];
    if (material || pile) {
      explainerParts.push(
        `Minky is a plush, low-pile polyester fabric with a faux-fur feel.` +
          (material ? ` This one is ${escapeHtml(material)}` : '') +
          (pile ? ` with a ${escapeHtml(pile)} pile.` : material ? '.' : ''),
      );
    }
    const explainer = explainerParts.length
      ? `<h2>What is minky fabric, and what is this made of?</h2><p>${explainerParts.join(' ')}</p>`
      : '';

    // ---- spec table (only grounded rows) ----------------------------------
    const specRows: [string, string | null][] = [
      ['Material', material],
      ['Pile', pile],
      ['Width', width],
      ['Colors', colorCount && colorList ? `${colorCount} shades: ${colorList}` : colorList],
      ['Sold as', soldAs && priceLow ? `${soldAs} (from $${priceYard ?? priceLow})` : soldAs],
      ['Care', care],
    ];
    const specBody = specRows
      .filter(([, v]) => v)
      .map(([k, v]) => `<tr><td>${k}</td><td>${escapeHtml(String(v))}</td></tr>`)
      .join('');
    const specSection = specBody ? `<h2>Specs</h2><table>${specBody}</table>` : '';

    // ---- FAQ (answers derived from facts; gaps answered honestly) ----------
    const faqs: [string, string][] = [];
    if (width) faqs.push([`How wide is it?`, `${escapeHtml(width)}, so a single width covers most throw-size projects.`]);
    if (care) faqs.push([`How do I wash it?`, `${escapeHtml(care)}.`]);
    faqs.push([`Is this solid or printed?`, `Solid. This listing is the solid range${colorCount ? ` (${colorCount} shades)` : ''}. Prints and dots are separate listings.`]);
    // Units only; the price range lives in the spec table (avoid restating
    // drift-prone prices throughout the prose).
    if (soldAs) faqs.push([`How is it sold?`, `${escapeHtml(soldAs)}.`]);
    const faqSection = faqs.length
      ? `<h2>FAQ</h2>${faqs.map(([q, a]) => `<p><strong>${q}</strong> ${a}</p>`).join('')}`
      : '';

    const html =
      `<h1>${escapeHtml(titleCase(primaryKw))}</h1>` +
      lead +
      whoSection +
      explainer +
      specSection +
      faqSection;

    // ---- meta -------------------------------------------------------------
    const metaTitle = buildMetaTitle(primaryKw, vendorShort, width ? `${width} smooth` : descriptor);
    const descParts = [
      `Shop ${primaryKw} in ${colorCount ?? 'multiple'} shades.`,
      [pile ? `${pile} pile` : null, material, width ? `${width} wide` : null].filter(Boolean).join(', ') + '.',
      soldAs ? `${soldAs}.` : '',
      care && /wash/i.test(care) ? 'Machine washable.' : '',
    ].filter(Boolean);
    const metaDesc = clamp(descParts.join(' ').replace(/\s+/g, ' ').trim(), 155);
    const meta: PieceMeta = { title: metaTitle, description: metaDesc, slug: slugify(primaryKw) };

    // ---- JSON-LD (Product; priceCurrency from store; no aggregateRating) ---
    const jsonld = buildProductJsonLd({
      name: title,
      vendor: input.vendorName,
      material,
      description: metaDesc,
      productType: val(m, 'productType'),
      pile,
      width,
      care,
      priceLow,
      priceHigh,
      currency: input.store.currency ?? 'USD',
      inStock: /[1-9]/.test(val(m, 'availability') ?? '0'),
    });

    return { html, meta, jsonld, variantMap: input.selection.variantMap, rewriterId: this.id };
  }
}

function buildProductJsonLd(a: {
  name: string;
  vendor: string;
  material: string | null;
  description: string;
  productType: string | null;
  pile: string | null;
  width: string | null;
  care: string | null;
  priceLow: string | null;
  priceHigh: string | null;
  currency: string;
  inStock: boolean;
}): Record<string, unknown> {
  const additionalProperty = [
    a.pile ? { '@type': 'PropertyValue', name: 'Pile', value: a.pile } : null,
    a.width ? { '@type': 'PropertyValue', name: 'Width', value: a.width } : null,
    a.care ? { '@type': 'PropertyValue', name: 'Care', value: a.care } : null,
  ].filter(Boolean);

  const jsonld: Record<string, unknown> = {
    '@context': 'https://schema.org/',
    '@type': 'Product',
    name: a.name,
    brand: { '@type': 'Brand', name: a.vendor },
    description: a.description,
  };
  if (a.material) jsonld.material = a.material;
  if (a.productType) jsonld.category = `Fabric > ${a.productType}`;
  if (additionalProperty.length) jsonld.additionalProperty = additionalProperty;
  if (a.priceLow && a.priceHigh) {
    jsonld.offers = {
      '@type': 'AggregateOffer',
      priceCurrency: a.currency, // from store settings, never assumed
      lowPrice: a.priceLow,
      highPrice: a.priceHigh,
      availability: a.inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
    };
  }
  // NOTE: no aggregateRating — no review data exists in source.
  return jsonld;
}

// ---- naive rewriter (DEMO ONLY — produces ungrounded output) ---------------

class NaiveRewriter implements Rewriter {
  readonly id = 'naive-ungrounded-demo';

  async rewrite(input: RewriteInput): Promise<PieceDraft> {
    const m = buildFactMap(input.facts);
    const primaryKw = input.selection.primary.candidate.keyword;
    const title = val(m, 'title') ?? primaryKw;
    // reuse T3 prose verbatim (the careless move the verifier must catch)
    const t3 = input.facts.find((f) => f.field === 'prose');
    const prose = t3 ? t3.value : 'This premium fabric is the ultimate luxurious choice.';

    // body: asserts a fabricated GSM, a banned word, an em dash, and T3 prose.
    const html =
      `<h1>${titleCase(primaryKw)}</h1>` +
      `<p>${escapeHtml(prose)}</p>` +
      `<p>This is a premium, ultimate-quality fabric — woven to a 220 GSM weight for extra plushness.</p>` +
      `<h2>Specs</h2><table>` +
      `<tr><td>Material</td><td>${escapeHtml(val(m, 'material') ?? '100% Polyester')}</td></tr>` +
      `<tr><td>Weight</td><td>220 GSM</td></tr>` + // fabricated number — not in facts
      `<tr><td>Certification</td><td>OEKO-TEX certified</td></tr>` + // fabricated cert
      `</table>` +
      `<h2>Reviews</h2><p>Rated 4.8 from 128 happy customers.</p>`; // fabricated reviews

    const meta: PieceMeta = {
      title: `${titleCase(primaryKw)} — Premium Minky Fabric | Best Quality`,
      description: 'The ultimate premium minky fabric, 220 GSM, OEKO-TEX certified, loved by 128 reviewers.',
      slug: slugify(primaryKw),
    };

    const jsonld: Record<string, unknown> = {
      '@context': 'https://schema.org/',
      '@type': 'Product',
      name: title,
      brand: { '@type': 'Brand', name: input.vendorName },
      aggregateRating: { '@type': 'AggregateRating', ratingValue: '4.8', reviewCount: '128' }, // fabricated
      offers: { '@type': 'Offer', priceCurrency: 'USD', price: val(m, 'price.low') ?? '14.95' },
    };

    return { html, meta, jsonld, variantMap: input.selection.variantMap, rewriterId: this.id };
  }
}

export const templateRewriter = new TemplateRewriter();
export const naiveRewriter = new NaiveRewriter();
