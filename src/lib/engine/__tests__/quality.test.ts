import { describe, it, expect } from 'vitest';
import { loadSnapshot, findRaw, normalizeProduct } from '../snapshot';
import { buildCatalogIndex } from '../catalog';
import { groundProduct } from '../layers/ground';
import { filterKeywords } from '../layers/filter';
import { FixtureSerpProvider } from '../layers/serp';
import { selectKeywords } from '../layers/select';
import { templateRewriter, naiveRewriter } from '../layers/rewrite';
import { runGates } from '../layers/gates';
import { aeoCheck, aeoBlockingFailures } from '../layers/aeo';
import { guardrails, hasBlockingFlag } from '../layers/guardrails';
import { gradePiece } from '../layers/verify';
import { stripTags } from '../html';
import { EZ_FABRIC_BRAND } from '../brand';
import { MINKY_RESEARCH, MINKY_SERP } from '../fixtures/minky-keywords';
import type { RewriteInput } from '../providers';

const SNAPSHOT = '/Users/gevbalyan/Claude/ez-fabric-public-snapshot.json';
const SOLID_MINKY_ID = 9345778286829;
const WORD_TARGET = { min: 250, max: 500 };

const snap = loadSnapshot(SNAPSHOT);
const index = buildCatalogIndex(snap.products.map(normalizeProduct));
const target = normalizeProduct(findRaw(snap, SOLID_MINKY_ID)!);
const ground = groundProduct({ product: target, brand: EZ_FABRIC_BRAND });
const filtered = filterKeywords(MINKY_RESEARCH, index, target);

async function buildSelection() {
  const serp = await new FixtureSerpProvider(MINKY_SERP).ownership(filtered.kept, ground.authority);
  return selectKeywords(filtered, serp, target);
}

async function rewriteInput(): Promise<RewriteInput> {
  return {
    facts: ground.facts,
    store: ground.store,
    selection: await buildSelection(),
    brandVoiceNote: EZ_FABRIC_BRAND.voiceNote,
    vendorName: EZ_FABRIC_BRAND.vendorName,
    wordTarget: WORD_TARGET,
    gaps: ground.gaps.map((g) => `${g.field}: ${g.note}`),
  };
}

describe('volatile fields never enter static copy (Lane D finding)', () => {
  const STOCK = /\b\d+\s*(?:of|\/)\s*\d+\s*(?:variants?\s*)?(?:in[\s-]?stock|available)\b|\bvariants? in[\s-]?stock\b|\b\d+\s+in[\s-]?stock\b/i;

  it('template body + spec table contain no stock/availability count', async () => {
    const draft = await templateRewriter.rewrite(await rewriteInput());
    expect(STOCK.test(stripTags(draft.html))).toBe(false);
    expect(draft.html.toLowerCase()).not.toContain('in stock');
  });

  it('but JSON-LD still carries offers.availability (the right place for it)', async () => {
    const draft = await templateRewriter.rewrite(await rewriteInput());
    const offers = draft.jsonld.offers as Record<string, unknown>;
    expect(String(offers.availability)).toMatch(/schema\.org\/(In|OutOf)Stock/);
  });

  it('the FAQ no longer restates exact prices (drift-prone)', async () => {
    const draft = await templateRewriter.rewrite(await rewriteInput());
    const faq = draft.html.slice(draft.html.indexOf('<h2>FAQ'));
    expect(/\$\d/.test(faq)).toBe(false);
  });

  it('guardrails WARN-flags a leaked stock count in body prose', async () => {
    const input = await rewriteInput();
    const leaky = {
      ...(await templateRewriter.rewrite(input)),
      html: '<h1>X</h1><h2>Specs</h2><table><tr><td>Availability</td><td>20 of 20 variants in stock</td></tr></table>',
    };
    const flags = guardrails({
      draft: leaky,
      facts: ground.facts,
      brand: EZ_FABRIC_BRAND,
      gaps: ground.gaps,
      selection: input.selection,
      carried: ground.provenanceFlags,
    });
    expect(flags.some((f) => /volatile/i.test(f.note))).toBe(true);
  });
});

describe('grounded template rewriter passes Part A', () => {
  it('produces gate-clean output (zero violations)', async () => {
    const draft = await templateRewriter.rewrite(await rewriteInput());
    const gated = runGates(draft, EZ_FABRIC_BRAND, WORD_TARGET);
    expect(gated.violations, JSON.stringify(gated.violations)).toEqual([]);
  });

  it('passes AEO blocking checks', async () => {
    const input = await rewriteInput();
    const draft = await templateRewriter.rewrite(input);
    const findings = aeoCheck(draft, ground.facts, input.selection.primary.candidate.keyword);
    expect(aeoBlockingFailures(findings)).toEqual([]);
  });

  it('verifier (independent) PASSES with every claim grounded', async () => {
    const draft = await templateRewriter.rewrite(await rewriteInput());
    const gated = runGates(draft, EZ_FABRIC_BRAND, WORD_TARGET);
    const verdict = gradePiece(gated.draft, ground.facts, 'independent');
    expect(verdict.perGate['A1.grounding'].pass, verdict.perGate['A1.grounding'].note).toBe(true);
    expect(verdict.verdict).toBe('pass');
    // every numeric claim trace is grounded
    expect(verdict.claimTrace.every((c) => c.grounded)).toBe(true);
  });

  it('guardrails: no BAD flags; surfaces gaps + trademark-adjacent WARN', async () => {
    const input = await rewriteInput();
    const draft = await templateRewriter.rewrite(input);
    const flags = guardrails({
      draft,
      facts: ground.facts,
      brand: EZ_FABRIC_BRAND,
      gaps: ground.gaps,
      selection: input.selection,
      carried: ground.provenanceFlags,
    });
    expect(hasBlockingFlag(flags)).toBe(false);
    expect(flags.some((f) => f.type === 'gap')).toBe(true);
    // "minky cuddle fabric" is a targeted secondary → trademark WARN for sign-off
    expect(flags.some((f) => f.type === 'trademark' && f.severity === 'WARN')).toBe(true);
  });

  it('JSON-LD has no aggregateRating and priceCurrency from store', async () => {
    const draft = await templateRewriter.rewrite(await rewriteInput());
    expect('aggregateRating' in draft.jsonld).toBe(false);
    const offers = draft.jsonld.offers as Record<string, unknown>;
    expect(offers.priceCurrency).toBe('USD');
  });
});

describe('naive rewriter is CAUGHT (the demo gotcha)', () => {
  it('verifier FAILS on fabricated GSM / cert / reviews', async () => {
    const draft = await naiveRewriter.rewrite(await rewriteInput());
    const verdict = gradePiece(draft, ground.facts, 'independent');
    expect(verdict.verdict).toBe('fail');
    expect(verdict.perGate['A1.grounding'].pass).toBe(false);
    const ungrounded = verdict.claimTrace.filter((c) => !c.grounded).map((c) => c.claim);
    expect(ungrounded).toContain('220'); // fabricated GSM
    expect(ungrounded.some((c) => /OEKO/i.test(c))).toBe(true); // fabricated cert
  });

  it('verifier FAILS A3 on fabricated reviews', async () => {
    const draft = await naiveRewriter.rewrite(await rewriteInput());
    const verdict = gradePiece(draft, ground.facts, 'independent');
    expect(verdict.perGate['A3.structured-data'].pass).toBe(false);
  });

  it('guardrails BLOCK on fabricated cert + banned word + em dash via gates', async () => {
    const input = await rewriteInput();
    const draft = await naiveRewriter.rewrite(input);
    const flags = guardrails({
      draft,
      facts: ground.facts,
      brand: EZ_FABRIC_BRAND,
      gaps: ground.gaps,
      selection: input.selection,
      carried: ground.provenanceFlags,
    });
    expect(hasBlockingFlag(flags)).toBe(true); // regulated cert (not in source) = BAD
    const gated = runGates(draft, EZ_FABRIC_BRAND, WORD_TARGET);
    expect(gated.violations.some((v) => v.gate === 'banned-word')).toBe(true); // "premium"
  });
});
