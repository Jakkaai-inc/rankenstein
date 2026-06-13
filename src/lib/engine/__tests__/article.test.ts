import { describe, it, expect } from 'vitest';
import { loadSnapshot, normalizeProduct } from '../snapshot';
import { buildCatalogIndex } from '../catalog';
import { runArticle, type ArticleRunDeps } from '../pipeline';
import { offlineArticleDeps, DEFAULT_ARTICLE_RUN_CONFIG } from '../offline';
import { EZ_FABRIC_BRAND, EZ_FABRIC_BRAND_UNCONFIRMED } from '../brand';
import { groundArticle } from '../layers/ground';
import { filterKeywords } from '../layers/filter';
import { runOutlineLoop, FixtureOutlineProvider, DeterministicCritic } from '../layers/outline';
import { validateAngle } from '../layers/angle';
import { templateArticleDrafter, naiveArticleDrafter } from '../layers/draft';
import { FixtureCitationChecker, verifyCitations, citationsBlocking } from '../layers/citation-verify';
import { gradeArticle } from '../layers/verify';
import {
  ARTICLE_TOPIC,
  ARTICLE_RESEARCH,
  ARTICLE_ANGLE_SET,
  ARTICLE_OUTLINE,
  ARTICLE_SOURCES,
  ARTICLE_CITATION_OK,
  ARTICLE_CITATION_BAD,
} from '../fixtures/minky-article';
import type { Outline, OutlineCritique } from '../types';
import type { OutlineCritic } from '../providers';

const SNAPSHOT = '/Users/gevbalyan/Claude/ez-fabric-public-snapshot.json';
const snap = loadSnapshot(SNAPSHOT);
const index = buildCatalogIndex(snap.products.map(normalizeProduct));

function run(deps: ArticleRunDeps) {
  return runArticle({ topic: ARTICLE_TOPIC, brand: EZ_FABRIC_BRAND, catalogIndex: index, runConfig: DEFAULT_ARTICLE_RUN_CONFIG, deps, sources: ARTICLE_SOURCES });
}

describe('angle layer', () => {
  it('chosen angle passes the subject-line specificity check', () => {
    expect(validateAngle(ARTICLE_ANGLE_SET).ok).toBe(true);
  });
  it('rejects a bare generic label', () => {
    const bad = { ...ARTICLE_ANGLE_SET, chosen: { lens: 'data-led' as const, headline: 'Guide', why: 'x' } };
    expect(validateAngle(bad).ok).toBe(false);
  });
});

describe('filter (article mode)', () => {
  const pseudo = groundArticle({ topic: ARTICLE_TOPIC, brand: EZ_FABRIC_BRAND }).pseudoProduct;
  const filtered = filterKeywords(ARTICLE_RESEARCH, index, pseudo, undefined, 'article');
  const keptKw = filtered.kept.map((k) => k.keyword);
  it('drops near-me and competitor terms', () => {
    expect(keptKw).not.toContain('minky fabric near me');
    expect(keptKw).not.toContain('joann minky fabric');
  });
  it('keeps informational head terms (articles may target them)', () => {
    expect(keptKw).toContain('how to choose minky fabric');
    expect(keptKw).toContain('is minky fabric safe for babies');
  });
});

describe('outline + critic enforced loop', () => {
  const angle = ARTICLE_ANGLE_SET.chosen;
  const win = { min: 250, max: 1800 };

  it('passes a complete outline in one round', async () => {
    const r = await runOutlineLoop(new FixtureOutlineProvider(ARTICLE_OUTLINE), new DeterministicCritic(), angle, ['k'], win, []);
    expect(r.status).toBe('pass');
    if (r.status === 'pass') expect(r.rounds).toBe(1);
  });

  it('HARD STOPS after 3 rounds when the critic always revises (never drafts)', async () => {
    const alwaysRevise: OutlineCritic = {
      async critique(): Promise<OutlineCritique> {
        return { verdict: 'revise', issues: ['needs a sharper hook'] };
      },
    };
    const r = await runOutlineLoop(new FixtureOutlineProvider(ARTICLE_OUTLINE), alwaysRevise, angle, ['k'], win, []);
    expect(r.status).toBe('fail');
    if (r.status === 'fail') {
      expect(r.rounds).toBe(3);
      expect(r.issues.length).toBeGreaterThan(0);
    }
  });

  it('a missing-FAQ outline is flagged by the deterministic critic', async () => {
    const incomplete: Outline = { ...ARTICLE_OUTLINE, faqs: [] };
    const crit = await new DeterministicCritic().critique(incomplete);
    expect(crit.verdict).toBe('revise');
    expect(crit.issues.join(' ')).toMatch(/FAQ/i);
  });
});

describe('draft layer', () => {
  it('template drafter cites external claims inline with non-empty image src', async () => {
    const d = await templateArticleDrafter.draft({ outline: ARTICLE_OUTLINE, facts: [], brandVoiceNote: '', vendorName: 'EZ', sources: ARTICLE_SOURCES });
    expect(d.citations.length).toBeGreaterThan(0);
    for (const c of d.citations) expect(d.html).toContain(c.url); // linked inline
    expect(d.images[0].src).toBeTruthy(); // never empty
    expect(d.html).toMatch(/data-image-prompt=/);
    expect(JSON.stringify(d.jsonld)).toMatch(/"Article"/);
    expect(JSON.stringify(d.jsonld)).toMatch(/"FAQPage"/);
  });

  it('naive drafter emits an uncited statistic with zero citations', async () => {
    const d = await naiveArticleDrafter.draft({ outline: ARTICLE_OUTLINE, facts: [], brandVoiceNote: '', vendorName: 'EZ' });
    expect(d.citations.length).toBe(0);
    expect(d.html).toMatch(/73%/);
  });
});

describe('citation-verify', () => {
  it('blocks when a source fails to support its claim', async () => {
    const d = await templateArticleDrafter.draft({ outline: ARTICLE_OUTLINE, facts: [], brandVoiceNote: '', vendorName: 'EZ', sources: ARTICLE_SOURCES });
    const okV = await verifyCitations(d.citations, new FixtureCitationChecker(ARTICLE_CITATION_OK));
    expect(citationsBlocking(okV)).toBe(false);
    const badV = await verifyCitations(d.citations, new FixtureCitationChecker(ARTICLE_CITATION_BAD));
    expect(citationsBlocking(badV)).toBe(true);
  });
});

describe('gradeArticle (verifier)', () => {
  it('PASSES a grounded + cited article', async () => {
    const d = await templateArticleDrafter.draft({ outline: ARTICLE_OUTLINE, facts: [], brandVoiceNote: '', vendorName: 'EZ', sources: ARTICLE_SOURCES });
    const piece = { html: d.html, meta: d.meta, jsonld: d.jsonld, variantMap: [], rewriterId: d.drafterId };
    const verdicts = await verifyCitations(d.citations, new FixtureCitationChecker(ARTICLE_CITATION_OK));
    const v = gradeArticle(piece, [], d.citations, verdicts, 'independent');
    expect(v.perGate['A1.grounding'].pass, v.perGate['A1.grounding'].note).toBe(true);
    expect(v.verdict).toBe('pass');
  });

  it('FAILS an uncited statistic (the demo gotcha)', async () => {
    const d = await naiveArticleDrafter.draft({ outline: ARTICLE_OUTLINE, facts: [], brandVoiceNote: '', vendorName: 'EZ' });
    const piece = { html: d.html, meta: d.meta, jsonld: d.jsonld, variantMap: [], rewriterId: d.drafterId };
    const v = gradeArticle(piece, [], [], [], 'independent');
    expect(v.verdict).toBe('fail');
    expect(v.perGate['A1.grounding'].note).toMatch(/73/);
  });
});

describe('runArticle end-to-end', () => {
  it('grounded path ships for review (kind article, verifier pass, gates clean)', async () => {
    const r = await run(offlineArticleDeps());
    expect(r.result.kind).toBe('article');
    expect(r.result.status, JSON.stringify(r.result.violations)).toBe('pending_review');
    expect(r.result.verdict.verdict).toBe('pass');
    expect(r.result.violations).toEqual([]);
    expect(r.result.html.includes('—')).toBe(false);
    expect(JSON.stringify(r.result.jsonld)).toMatch(/FAQPage/);
    expect(r.citations?.length).toBeGreaterThan(0);
    expect(r.outline?.sections.length).toBeGreaterThanOrEqual(3);
  });

  it('naive drafter is caught (uncited stat -> flagged)', async () => {
    const r = await run(offlineArticleDeps({ naive: true }));
    expect(r.result.status).toBe('flagged');
    expect(r.result.verdict.verdict).toBe('fail');
    expect(r.result.verdict.failures.join(' ')).toMatch(/73/);
  });

  it('a failing citation blocks the piece', async () => {
    const r = await run(offlineArticleDeps({ badCitation: true }));
    expect(r.result.status).toBe('flagged');
    expect(r.result.violations.some((v) => v.gate === 'citation')).toBe(true);
  });

  it('a never-passing outline HARD STOPS before drafting', async () => {
    const deps = offlineArticleDeps();
    deps.critic = { async critique(): Promise<OutlineCritique> { return { verdict: 'revise', issues: ['sharper hook'] }; } };
    const r = await runArticle({ topic: ARTICLE_TOPIC, brand: EZ_FABRIC_BRAND, catalogIndex: index, runConfig: DEFAULT_ARTICLE_RUN_CONFIG, deps });
    expect(r.result.status).toBe('flagged');
    expect(r.haltReason).toMatch(/outline failed critic/i);
    expect(r.result.html).toBe(''); // never drafted
  });

  it('HARD STOPS on an unconfirmed brand', async () => {
    const r = await runArticle({ topic: ARTICLE_TOPIC, brand: EZ_FABRIC_BRAND_UNCONFIRMED, catalogIndex: index, runConfig: DEFAULT_ARTICLE_RUN_CONFIG, deps: offlineArticleDeps() });
    expect(r.result.status).toBe('flagged');
    expect(r.haltReason).toMatch(/not confirmed/i);
  });
});
