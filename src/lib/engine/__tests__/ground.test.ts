import { describe, it, expect } from 'vitest';
import { loadSnapshot, findRaw, normalizeProduct } from '../snapshot';
import { groundProduct, BrandUnconfirmedError, trustedFact } from '../layers/ground';
import { EZ_FABRIC_BRAND, EZ_FABRIC_BRAND_UNCONFIRMED } from '../brand';

const SNAPSHOT = '/Users/gevbalyan/Claude/ez-fabric-public-snapshot.json';
const SOLID_MINKY_ID = 9345778286829; // clean body, the reference product
const SPOTTED_DOVE_ID = 9370119438573; // pasted Claude-chat artifact body

const snap = loadSnapshot(SNAPSHOT);

function ground(id: number) {
  const raw = findRaw(snap, id);
  if (!raw) throw new Error(`product ${id} not in snapshot`);
  return groundProduct({ product: normalizeProduct(raw), brand: EZ_FABRIC_BRAND });
}

describe('ground layer — clean product (Solid Silky Minky)', () => {
  const r = ground(SOLID_MINKY_ID);

  it('extracts T1 structured facts (prices, colors, sold-as)', () => {
    expect(trustedFact(r.facts, 'price.low')?.value).toBe('14.95');
    expect(trustedFact(r.facts, 'price.high')?.value).toBe('324.00');
    expect(trustedFact(r.facts, 'colorCount')?.value).toBe('9');
    const soldAs = trustedFact(r.facts, 'soldAs')?.value ?? '';
    expect(soldAs).toContain('Per Yard');
    expect(soldAs).toContain('Roll');
  });

  it('extracts per-unit prices from variants (T1)', () => {
    expect(trustedFact(r.facts, 'price.per-yard')?.value).toBe('14.95');
    expect(trustedFact(r.facts, 'price.bolt')?.value).toBe('112.20');
    expect(trustedFact(r.facts, 'price.roll')?.value).toBe('324.00');
  });

  it('extracts T2 merchant-stated spec lines from clean body', () => {
    const material = trustedFact(r.facts, 'material');
    expect(material?.trust).toBe('T2');
    expect(material?.value.toLowerCase()).toContain('polyester');
    expect(trustedFact(r.facts, 'width')?.value).toContain('60');
    expect(trustedFact(r.facts, 'care')?.value.toLowerCase()).toContain('wash');
  });

  it('flags GSM gap (3mm is pile height, not weight) and ironing gap', () => {
    const gapFields = r.gaps.map((g) => g.field);
    expect(gapFields).toContain('weight.gsm');
    expect(gapFields).toContain('care.ironing');
  });

  it('records no review data (no aggregateRating allowed)', () => {
    expect(r.facts.find((f) => f.field === 'reviews.present')?.value).toBe('false');
  });

  it('no provenance demotion for a clean body', () => {
    expect(r.provenanceFlags.length).toBe(0);
  });

  it('store currency defaults to USD; authority is low web-estimate offline', () => {
    expect(r.store.currency).toBe('USD');
    expect(r.authority.source).toBe('web-estimate');
  });
});

describe('ground layer — artifact product (Spotted Dove, Claude paste)', () => {
  const r = ground(SPOTTED_DOVE_ID);

  it('demotes the whole body to T3 with a provenance flag', () => {
    expect(r.provenanceFlags.length).toBeGreaterThan(0);
    expect(r.provenanceFlags[0].type).toBe('provenance');
    expect(r.provenanceFlags[0].note).toMatch(/AI-chat artifacts/i);
  });

  it('extracts NO T2 specs from a demoted body (material/width become gaps)', () => {
    expect(trustedFact(r.facts, 'material')).toBeNull();
    expect(trustedFact(r.facts, 'width')).toBeNull();
    const gapFields = r.gaps.map((g) => g.field);
    expect(gapFields).toContain('material');
    expect(gapFields).toContain('width');
  });

  it('still grounds T1 structured facts (prices/colors survive)', () => {
    expect(trustedFact(r.facts, 'price.low')).not.toBeNull();
    expect(Number(trustedFact(r.facts, 'colorCount')?.value)).toBeGreaterThan(0);
  });

  it('keeps the demoted prose only as a T3 row (never assertable)', () => {
    const prose = r.facts.find((f) => f.field === 'prose');
    expect(prose?.trust).toBe('T3');
    expect(prose?.source).toMatch(/artifact-demoted/);
  });
});

describe('ground layer — HARD STOP', () => {
  it('refuses to run when the brand profile is unconfirmed', () => {
    const raw = findRaw(snap, SOLID_MINKY_ID)!;
    expect(() =>
      groundProduct({ product: normalizeProduct(raw), brand: EZ_FABRIC_BRAND_UNCONFIRMED }),
    ).toThrow(BrandUnconfirmedError);
  });
});
