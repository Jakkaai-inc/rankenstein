import { describe, it, expect } from 'vitest';
import { loadSnapshot, findRaw, normalizeProduct } from '../snapshot';
import { buildCatalogIndex } from '../catalog';
import { runProductRewrite } from '../pipeline';
import { offlineMinkyDeps, DEFAULT_RUN_CONFIG } from '../offline';
import { renderPreview } from '../preview';
import { EZ_FABRIC_BRAND } from '../brand';

const SNAPSHOT = '/Users/gevbalyan/Claude/ez-fabric-public-snapshot.json';
const SOLID_MINKY_ID = 9345778286829;

const snap = loadSnapshot(SNAPSHOT);
const index = buildCatalogIndex(snap.products.map(normalizeProduct));
const solid = normalizeProduct(findRaw(snap, SOLID_MINKY_ID)!);

async function previewHtml() {
  const run = await runProductRewrite({
    product: solid,
    brand: EZ_FABRIC_BRAND,
    catalogIndex: index,
    runConfig: DEFAULT_RUN_CONFIG,
    deps: offlineMinkyDeps(),
  });
  return renderPreview(run, { originalBodyHtml: solid.bodyHtml, productGid: solid.id, storeDomain: 'ezfabricinc.com' });
}

describe('renderPreview', () => {
  it('emits exactly one <h1> (the product page h1), preview chrome aside', async () => {
    const html = await previewHtml();
    expect((html.match(/<h1[\s>]/g) ?? []).length).toBe(1);
  });

  it('contains zero em dashes (preview chrome is in scope)', async () => {
    const html = await previewHtml();
    expect(html.includes('—')).toBe(false);
  });

  it('shows keyword map, before/after, meta, JSON-LD, and flags', async () => {
    const html = await previewHtml();
    expect(html).toMatch(/Keyword map/);
    expect(html).toMatch(/Before -&gt; After/);
    expect(html).toMatch(/Before \(live\)/);
    expect(html).toMatch(/After \(AEO rewrite, grounded\)/);
    expect(html).toMatch(/JSON-LD/);
    expect(html).toMatch(/Guardrail flags/);
    expect(html).toMatch(/minky fabric by the yard/);
  });

  it('renders embedded JSON-LD that parses as a Product with no aggregateRating', async () => {
    const html = await previewHtml();
    const m = html.match(/<pre>([\s\S]*?)<\/pre>/);
    expect(m).not.toBeNull();
    const decoded = m![1]
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>');
    const obj = JSON.parse(decoded);
    expect(obj['@type']).toBe('Product');
    expect('aggregateRating' in obj).toBe(false);
  });
});
