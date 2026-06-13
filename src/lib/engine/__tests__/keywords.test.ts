import { describe, it, expect } from 'vitest';
import { loadSnapshot, findRaw, normalizeProduct } from '../snapshot';
import { buildCatalogIndex } from '../catalog';
import { FixtureResearchProvider, validateResearch } from '../layers/research';
import { filterKeywords } from '../layers/filter';
import { FixtureSerpProvider } from '../layers/serp';
import { selectKeywords } from '../layers/select';
import { MINKY_RESEARCH, MINKY_SERP } from '../fixtures/minky-keywords';
import type { Registry } from '../types';

const SNAPSHOT = '/Users/gevbalyan/Claude/ez-fabric-public-snapshot.json';
const SOLID_MINKY_ID = 9345778286829;

// Module-level so values exist at describe() collection time (before beforeAll).
const snap = loadSnapshot(SNAPSHOT);
const allProducts = snap.products.map(normalizeProduct);
const index = buildCatalogIndex(allProducts);
const target = normalizeProduct(findRaw(snap, SOLID_MINKY_ID)!);

describe('catalog index head-term math', () => {
  it('threshold is max(8, 25% of catalog)', () => {
    expect(index.headThreshold).toBe(Math.max(8, Math.ceil(0.25 * 633)));
  });
  it('"minky" is a head token (matches > threshold products)', () => {
    // minky appears in product_type for the vast majority → head
    const minkyCount = index.inverted.get('minky')?.size ?? 0;
    expect(minkyCount).toBeGreaterThan(index.headThreshold);
  });
});

describe('filter — product-rewrite drop rules', () => {
  const filtered = filterKeywords(MINKY_RESEARCH, index, target);
  const keptKw = filtered.kept.map((k) => k.keyword);
  const dropOf = (kw: string) => filtered.dropped.find((d) => d.candidate.keyword === kw);

  it('drops the pure head term "minky fabric" (commercial) → collection', () => {
    expect(keptKw).not.toContain('minky fabric');
    expect(dropOf('minky fabric')?.reason).toBe('head-or-category');
  });

  it('routes sibling-SKU terms away (printed / dot / dinosaur)', () => {
    expect(dropOf('printed minky fabric by the yard')?.reason).toBe('sibling-sku');
    expect(dropOf('minky dot fabric')?.reason).toBe('sibling-sku');
    expect(dropOf('dinosaur minky fabric')?.reason).toBe('sibling-sku');
  });

  it('keeps product-defining terms for THIS solid product', () => {
    expect(keptKw).toContain('minky fabric by the yard');
    expect(keptKw).toContain('solid minky fabric');
    expect(keptKw).toContain('smooth minky fabric');
    expect(keptKw).toContain('extra wide minky fabric');
  });

  it('keeps informational head terms for the FAQ (what is minky fabric)', () => {
    expect(keptKw).toContain('what is minky fabric');
  });

  it('keeps real variant color terms', () => {
    expect(keptKw).toContain('black minky fabric');
    expect(keptKw).toContain('brown minky fabric');
  });
});

describe('select — primary, variant map, firewall', () => {
  it('runs the whole path and picks a winnable transactional primary', async () => {
    validateResearch(MINKY_RESEARCH);
    const research = new FixtureResearchProvider(MINKY_RESEARCH);
    const candidates = await research.keywords(['minky fabric'], 'US');
    const filtered = filterKeywords(candidates, index, target);
    const serp = await new FixtureSerpProvider(MINKY_SERP).ownership(filtered.kept, {
      dr: null,
      source: 'web-estimate',
    });
    const sel = selectKeywords(filtered, serp, target);

    expect(sel.primary.candidate.intent).toBe('transactional');
    // highest-volume winnable product-defining term
    expect(sel.primary.candidate.keyword).toBe('minky fabric by the yard');
    expect(sel.primary.serp?.winnable).toBe('yes');
    expect(sel.historyDecision).toBe('net-new');
  });

  it('maps color terms to REAL shades only (brown→Taupe, gray→Gray)', async () => {
    const filtered = filterKeywords(MINKY_RESEARCH, index, target);
    const serp = await new FixtureSerpProvider(MINKY_SERP).ownership(filtered.kept, { dr: null, source: 'web-estimate' });
    const sel = selectKeywords(filtered, serp, target);
    const byKw = Object.fromEntries(sel.variantMap.map((v) => [v.keyword, v.variantValue]));
    expect(byKw['brown minky fabric']).toBe('Taupe');
    expect(byKw['gray minky fabric']).toBe('Gray');
    expect(byKw['black minky fabric']).toBe('Black');
    // real shades with no targeted demand are noted, not invented
    expect(sel.unmappedColorways).toContain('Dark Smoke');
  });

  it('lists cannibalization exclusions in the selection (for the brief)', async () => {
    const filtered = filterKeywords(MINKY_RESEARCH, index, target);
    const serp = await new FixtureSerpProvider(MINKY_SERP).ownership(filtered.kept, { dr: null, source: 'web-estimate' });
    const sel = selectKeywords(filtered, serp, target);
    const exKw = sel.exclusions.map((e) => e.keyword);
    expect(exKw).toContain('minky dot fabric');
    expect(exKw).toContain('minky fabric'); // head routed to collection
  });

  it('firewall: routes an already-owned exact keyword to refresh', async () => {
    const filtered = filterKeywords(MINKY_RESEARCH, index, target);
    const serp = await new FixtureSerpProvider(MINKY_SERP).ownership(filtered.kept, { dr: null, source: 'web-estimate' });
    const registry: Registry = {
      entries: [
        { keyword: 'minky fabric by the yard', intent: 'transactional', parentTopic: 'minky fabric', ownerPageId: 'page-99' },
      ],
    };
    const sel = selectKeywords(filtered, serp, target, registry);
    expect(sel.primary.candidate.keyword).not.toBe('minky fabric by the yard');
    const ex = sel.exclusions.find((e) => e.keyword === 'minky fabric by the yard');
    expect(ex?.routedTo).toMatch(/page-99/);
  });
});
