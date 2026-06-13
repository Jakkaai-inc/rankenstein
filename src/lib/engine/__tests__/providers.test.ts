// No-network structural tests for the live Anthropic providers. We construct
// them and exercise the pure helpers, but NEVER call the API (no key in CI).

import { describe, it, expect } from 'vitest';
import { parseJsonLoose, MODELS } from '../providers/anthropic';
import { liveDeps } from '../providers/live';
import { AnthropicRewriter } from '../providers/anthropic-rewrite';
import { AnthropicVerifier } from '../providers/anthropic-verify';
import { AnthropicResearchProvider } from '../providers/anthropic-research';
import { AnthropicSerpProvider } from '../providers/anthropic-serp';

const KEY = { apiKey: 'sk-ant-test-not-used' };

describe('parseJsonLoose', () => {
  it('parses a bare object', () => {
    expect(parseJsonLoose<{ a: number }>('{"a":1}')).toEqual({ a: 1 });
  });
  it('strips ```json fences', () => {
    expect(parseJsonLoose('```json\n{"a":2}\n```')).toEqual({ a: 2 });
  });
  it('finds an embedded JSON span amid prose', () => {
    expect(parseJsonLoose('Sure! Here it is: [{"k":"x"}] done')).toEqual([{ k: 'x' }]);
  });
});

describe('model tiers', () => {
  it('default to opus (strong) and haiku (fast)', () => {
    expect(MODELS.strong).toMatch(/opus/);
    expect(MODELS.fast).toMatch(/haiku/);
  });
});

describe('live providers construct without network and conform to interfaces', () => {
  it('rewriter exposes id + rewrite()', () => {
    const r = new AnthropicRewriter(KEY);
    expect(typeof r.id).toBe('string');
    expect(typeof r.rewrite).toBe('function');
  });

  it('verifier is independent-mode with verify()', () => {
    const v = new AnthropicVerifier(KEY);
    expect(v.mode).toBe('independent');
    expect(typeof v.verify).toBe('function');
  });

  it('research + serp providers expose their methods', () => {
    const research = new AnthropicResearchProvider(KEY);
    const serp = new AnthropicSerpProvider(KEY);
    expect(typeof research.keywords).toBe('function');
    expect(typeof serp.ownership).toBe('function');
  });

  it('liveDeps() builds a full RunDeps with an independent verifier', () => {
    const deps = liveDeps(KEY);
    expect(typeof deps.research.keywords).toBe('function');
    expect(typeof deps.serp.ownership).toBe('function');
    expect(typeof deps.rewriter.rewrite).toBe('function');
    expect(deps.verifier.mode).toBe('independent');
  });

  it('makeClient throws a clear error when no API key is available', async () => {
    const { makeClient } = await import('../providers/anthropic');
    const saved = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      expect(() => makeClient()).toThrow(/ANTHROPIC_API_KEY/);
    } finally {
      if (saved !== undefined) process.env.ANTHROPIC_API_KEY = saved;
    }
  });
});
