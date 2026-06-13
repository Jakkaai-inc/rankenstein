import { describe, it, expect } from 'vitest';
import { loadSnapshot, findRaw, normalizeProduct } from '../snapshot';
import { buildCatalogIndex } from '../catalog';
import { runProductRewrite } from '../pipeline';
import { offlineMinkyDeps, DEFAULT_RUN_CONFIG } from '../offline';
import { EZ_FABRIC_BRAND, EZ_FABRIC_BRAND_UNCONFIRMED } from '../brand';

const SNAPSHOT = '/Users/gevbalyan/Claude/ez-fabric-public-snapshot.json';
const SOLID_MINKY_ID = 9345778286829;
const SPOTTED_DOVE_ID = 9370119438573;

const snap = loadSnapshot(SNAPSHOT);
const allProducts = snap.products.map(normalizeProduct);
const index = buildCatalogIndex(allProducts);
const solidMinky = normalizeProduct(findRaw(snap, SOLID_MINKY_ID)!);
const spottedDove = normalizeProduct(findRaw(snap, SPOTTED_DOVE_ID)!);

describe('runProductRewrite — grounded path (solid minky)', () => {
  it('returns a contract-conformant PieceResult ready for review', async () => {
    const run = await runProductRewrite({
      product: solidMinky,
      brand: EZ_FABRIC_BRAND,
      catalogIndex: index,
      runConfig: DEFAULT_RUN_CONFIG,
      deps: offlineMinkyDeps(),
    });
    const r = run.result;
    expect(r.kind).toBe('product');
    expect(r.status).toBe('pending_review');
    expect(r.verdict.verdict).toBe('pass');
    expect(r.verdict.isSelfCheck).toBe(false);
    expect(r.violations).toEqual([]);
    expect(r.primaryKeyword).toBe('minky fabric by the yard');
    expect(r.metaTitle.length).toBeLessThanOrEqual(62);
    expect(r.metaDescription.length).toBeLessThanOrEqual(155);
    expect(r.slug.split('-').length).toBeLessThanOrEqual(5);
  });

  it('brief reports keyword source, SERP note, computed word count, exclusions', async () => {
    const run = await runProductRewrite({
      product: solidMinky,
      brand: EZ_FABRIC_BRAND,
      catalogIndex: index,
      runConfig: DEFAULT_RUN_CONFIG,
      deps: offlineMinkyDeps(),
    });
    const b = run.result.brief;
    expect(b.keywordDataSource).toBe('provider-verified');
    expect(b.serpOwnershipNote).toMatch(/winnable/i);
    expect(b.wordCount).toBeGreaterThanOrEqual(250);
    expect(b.wordCount).toBeLessThanOrEqual(500);
    expect(b.exclusions.map((e) => e.keyword)).toContain('minky dot fabric');
  });

  it('exposes variant map + gaps in the engine superset', async () => {
    const run = await runProductRewrite({
      product: solidMinky,
      brand: EZ_FABRIC_BRAND,
      catalogIndex: index,
      runConfig: DEFAULT_RUN_CONFIG,
      deps: offlineMinkyDeps(),
    });
    expect(run.variantMap.map((v) => v.variantValue)).toContain('Taupe');
    expect(run.gaps.join(' ')).toMatch(/weight\.gsm|GSM/i);
    expect(run.guardrailFlags.some((f) => f.type === 'gap')).toBe(true);
  });
});

describe('runProductRewrite — naive rewriter is caught', () => {
  it('self-flags the piece (verifier fail) instead of shipping it', async () => {
    const run = await runProductRewrite({
      product: solidMinky,
      brand: EZ_FABRIC_BRAND,
      catalogIndex: index,
      runConfig: DEFAULT_RUN_CONFIG,
      deps: offlineMinkyDeps({ naive: true }),
    });
    expect(run.result.status).toBe('flagged');
    expect(run.result.verdict.verdict).toBe('fail');
    expect(run.result.verdict.failures.join(' ')).toMatch(/220|OEKO/);
  });
});

describe('runProductRewrite — HARD STOP on unconfirmed brand', () => {
  it('halts with no content and a flagged status', async () => {
    const run = await runProductRewrite({
      product: solidMinky,
      brand: EZ_FABRIC_BRAND_UNCONFIRMED,
      catalogIndex: index,
      runConfig: DEFAULT_RUN_CONFIG,
      deps: offlineMinkyDeps(),
    });
    expect(run.result.status).toBe('flagged');
    expect(run.haltReason).toMatch(/not confirmed/i);
    expect(run.result.html).toBe('');
  });
});

describe('runProductRewrite — artifact product (Spotted Dove) grounds safely', () => {
  // The minky fixture's keywords are solid-specific; for a PRINT product none
  // survive the firewall, so the run self-flags rather than crashing or shipping
  // an untargeted page. Grounding still demotes the artifact body and lists gaps.
  const run = () =>
    runProductRewrite({
      product: spottedDove,
      brand: EZ_FABRIC_BRAND,
      catalogIndex: index,
      runConfig: DEFAULT_RUN_CONFIG,
      deps: offlineMinkyDeps(),
    });

  it('demotes the body (provenance flag) and lists material gap without inventing', async () => {
    const r = await run();
    expect(r.guardrailFlags.some((f) => f.type === 'provenance')).toBe(true);
    expect(r.gaps.join(' ')).toMatch(/material/i);
  });

  it('self-flags gracefully when no product-defining keyword survives', async () => {
    const r = await run();
    expect(r.result.status).toBe('flagged');
    expect(r.haltReason).toMatch(/keyword|primary|seed/i);
    // nothing fabricated leaks into a verdict failure
    expect(r.result.verdict.failures.join(' ')).not.toMatch(/220 GSM/);
  });
});
