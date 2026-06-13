// LAYER select (code + agent strong-tier, required)
//
// Deterministic core: consult the firewall, route cannibalization, assign roles,
// map variant terms to real shades, pick the primary by a transparent score, and
// decide net-new | spoke | refresh. A strong-tier agent MAY refine the primary
// choice within these bounds but may never relax the firewall.
//
// FIREWALL: reject/route a candidate if (a) the exact keyword already has a
// primary owner page, (b) it shares a parent topic at the SAME intent with an
// owned keyword on another page, or (c) its top-10 SERP overlaps >=30% with an
// owned keyword's SERP at the same intent. Different intent on a shared topic =>
// allowed as a spoke with an internal link to the owner.

import type {
  FilterResult,
  KeywordCandidate,
  NormalizedProduct,
  Registry,
  Selection,
  SelectedKeyword,
  SerpVerdict,
  VariantKeywordMap,
} from '../types';
import { tokenize, productTokens } from '../catalog';

const WINNABLE_WEIGHT = { yes: 1, stretch: 0.6, no: 0.1 } as const;

// Color synonyms → only applied when the canonical color is a real option value.
const COLOR_SYNONYMS: Record<string, string> = {
  brown: 'Taupe',
  grey: 'Gray',
  gray: 'Gray',
  silver: 'Silver',
  black: 'Black',
  white: 'White',
  ivory: 'Ivory',
  charcoal: 'Charcoal',
  tan: 'Taupe',
};

function colorOptionValues(product: NormalizedProduct): string[] {
  const opt = product.options.find((o) => /colou?r/i.test(o.name));
  return opt ? opt.values : [];
}

/** Map a keyword's color token to a real shade, or null if none matches. */
function mapToVariant(keyword: string, optionValues: string[]): string | null {
  const lowered = optionValues.map((v) => v.toLowerCase());
  for (const tok of tokenize(keyword)) {
    // exact match to an option value
    const exact = optionValues.find((v) => v.toLowerCase() === tok);
    if (exact) return exact;
    // synonym that resolves to an existing option value
    const syn = COLOR_SYNONYMS[tok];
    if (syn && lowered.includes(syn.toLowerCase())) return syn;
  }
  return null;
}

function score(c: KeywordCandidate, serp: SerpVerdict | undefined, thisTokens: Set<string>): number {
  const w = serp ? WINNABLE_WEIGHT[serp.winnable] : 0.6;
  const vol = c.volume ?? 10; // unknown volume gets a small default, never 0
  const overlap = tokenize(c.keyword).filter((t) => thisTokens.has(t)).length;
  return w * vol + overlap * 5 - (c.kd ?? 10);
}

function setOverlapPct(a: string[] | undefined, b: string[] | undefined): number {
  if (!a || !b || a.length === 0 || b.length === 0) return 0;
  const bs = new Set(b);
  const hits = a.filter((x) => bs.has(x)).length;
  return hits / Math.min(a.length, b.length);
}

export function selectKeywords(
  filtered: FilterResult,
  serpVerdicts: SerpVerdict[],
  target: NormalizedProduct,
  registry: Registry = { entries: [] },
): Selection {
  const serpMap = new Map(serpVerdicts.map((s) => [s.keyword, s]));
  const thisTokens = productTokens(target);
  const optionValues = colorOptionValues(target);

  const exclusions: Selection['exclusions'] = [];

  // 1. carry cannibalization routes from the filter (sibling-SKU, head/category).
  for (const d of filtered.dropped) {
    if (d.reason === 'sibling-sku' || d.reason === 'head-or-category') {
      exclusions.push({
        keyword: d.candidate.keyword,
        volume: d.candidate.volume,
        routedTo: d.reason === 'head-or-category' ? 'category/collection page' : d.detail,
      });
    }
  }

  // 2. split kept into variant terms, informational (faq), and rankable.
  const variantMap: VariantKeywordMap[] = [];
  const mappedShades = new Set<string>();
  const faqs: SelectedKeyword[] = [];
  const rankable: KeywordCandidate[] = [];

  for (const c of filtered.kept) {
    const shade = mapToVariant(c.keyword, optionValues);
    if (shade && /colou?r|black|white|gray|grey|silver|brown|ivory|charcoal|taupe|tan/i.test(c.keyword)) {
      variantMap.push({ keyword: c.keyword, volume: c.volume, kd: c.kd, variantValue: shade });
      mappedShades.add(shade);
      continue;
    }
    if (c.intent === 'informational') {
      faqs.push({ candidate: c, role: 'faq', serp: serpMap.get(c.keyword) });
      continue;
    }
    rankable.push(c);
  }

  // 3. firewall over rankable candidates.
  const survivors: KeywordCandidate[] = [];
  let primaryWouldRefresh = false;
  let primaryWouldSpoke = false;
  for (const c of rankable) {
    const exact = registry.entries.find((e) => e.keyword.toLowerCase() === c.keyword.toLowerCase());
    if (exact) {
      exclusions.push({ keyword: c.keyword, volume: c.volume, routedTo: `owned by page ${exact.ownerPageId} (refresh that page)` });
      primaryWouldRefresh = true;
      continue;
    }
    const sameParentIntent = registry.entries.find(
      (e) => e.parentTopic === c.parentTopic && e.intent === c.intent,
    );
    const serp = serpMap.get(c.keyword);
    const overlapHit = registry.entries.find(
      (e) => e.intent === c.intent && setOverlapPct(serp?.topUrls, e.serpTop10) >= 0.3,
    );
    if (sameParentIntent || overlapHit) {
      const owner = (sameParentIntent ?? overlapHit)!.ownerPageId;
      exclusions.push({ keyword: c.keyword, volume: c.volume, routedTo: `spoke → internal link to owner page ${owner}` });
      primaryWouldSpoke = true;
      continue;
    }
    survivors.push(c);
  }

  // 4. pick primary + secondaries by transparent score.
  const ranked = [...survivors].sort(
    (a, b) => score(b, serpMap.get(b.keyword), thisTokens) - score(a, serpMap.get(a.keyword), thisTokens),
  );
  // prefer a transactional primary; fall back to the top-scored survivor.
  const primaryCand =
    ranked.find((c) => c.intent === 'transactional') ?? ranked[0];
  if (!primaryCand) {
    throw new Error('select: no rankable primary survived the firewall');
  }
  const primary: SelectedKeyword = { candidate: primaryCand, role: 'primary', serp: serpMap.get(primaryCand.keyword) };
  const secondaries: SelectedKeyword[] = ranked
    .filter((c) => c !== primaryCand)
    .map((c) => ({ candidate: c, role: 'secondary' as const, serp: serpMap.get(c.keyword) }))
    .concat(faqs);

  // 5. history decision.
  const exactOwned = registry.entries.some((e) => e.keyword.toLowerCase() === primaryCand.keyword.toLowerCase());
  const historyDecision = exactOwned
    ? 'refresh'
    : registry.entries.some((e) => e.parentTopic === primaryCand.parentTopic && e.intent === primaryCand.intent)
      ? 'spoke'
      : 'net-new';
  void primaryWouldRefresh;
  void primaryWouldSpoke;

  // 6. unmapped colorways: real shades with no generic demand (don't force-map).
  const unmappedColorways = optionValues.filter((v) => !mappedShades.has(v));

  return { primary, secondaries, exclusions, variantMap, unmappedColorways, historyDecision };
}
