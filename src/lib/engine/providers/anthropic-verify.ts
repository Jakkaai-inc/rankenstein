// Live INDEPENDENT verifier (RUBRIC Part A, fresh context).
//
// Independence: a separate Anthropic client + a separate Messages call that did
// NOT write the piece. We MERGE the agent verdict with the deterministic
// gradePiece() backstop: a piece passes only if BOTH pass, and failures union.
// This means a fabricated number the agent overlooks is still caught by the
// deterministic claim-trace, and vice versa.

import Anthropic from '@anthropic-ai/sdk';
import type { EngineVerdict, FactRows, PieceDraft, InternalClaimTrace } from '../types';
import type { Verifier } from '../providers';
import { gradePiece } from '../layers/verify';
import { makeClient, structuredCall } from './anthropic';
import { stripTags } from '../html';

type AgentVerdict = {
  verdict: 'pass' | 'fail';
  perGate: Record<string, string>;
  claimTrace: { claim: string; source: string | null; trust: 'T1' | 'T2' | 'T3' | null; grounded: boolean }[];
  failures: string[];
};

const SYSTEM = `You are an INDEPENDENT content verifier. You did not write the page. Grade it against these gates and return JSON only.

A1 GROUNDING: every factual claim (material, dimension, price, care, certification, statistic, review count) must trace to a row in the provided FactsTable at tier T1 or T2. T3 (unverified prose) may NEVER be asserted. Any claim that traces to nothing is a failure.
A2 STRUCTURE: exactly one <h1>; an extractable spec <table>; an FAQ; a lead that states who it is for / what problem / how different.
A3 STRUCTURED DATA: JSON-LD is @type Product and parses; NO aggregateRating/review fields unless real review data exists in the FactsTable.
A4 BRAND VOICE: zero em dashes; no trademarked term used as a generic product type.

Return ONLY: {"verdict":"pass"|"fail","perGate":{"A1.grounding":"pass"|"fail: ...","A2.aeo-structure":...,"A3.structured-data":...,"A4.brand-voice":...},"claimTrace":[{"claim":string,"source":string|null,"trust":"T1"|"T2"|"T3"|null,"grounded":boolean}],"failures":[string]}. verdict is "pass" only if all four gates pass.`;

function renderFacts(facts: FactRows): string {
  return facts.map((f) => `- ${f.field} = ${f.value}  [${f.trust}]`).join('\n');
}

export class AnthropicVerifier implements Verifier {
  readonly mode = 'independent' as const;
  private client: Anthropic;
  constructor(opts?: { client?: Anthropic; apiKey?: string }) {
    // fresh client => independent context from the writer.
    this.client = opts?.client ?? makeClient({ apiKey: opts?.apiKey });
  }

  async verify(piece: PieceDraft, facts: FactRows): Promise<EngineVerdict> {
    // deterministic backstop (mode independent here because the caller is the
    // independent verifier; the math itself shares no state with the writer).
    const deterministic = gradePiece(piece, facts, 'independent');

    let agent: AgentVerdict | null = null;
    try {
      const user = [
        'FACTS TABLE:',
        renderFacts(facts),
        '',
        'PAGE HTML:',
        piece.html,
        '',
        `META TITLE: ${piece.meta.title}`,
        `META DESCRIPTION: ${piece.meta.description}`,
        '',
        'JSON-LD:',
        JSON.stringify(piece.jsonld),
        '',
        `PLAIN TEXT (for reference): ${stripTags(piece.html).slice(0, 2000)}`,
      ].join('\n');
      agent = await structuredCall<AgentVerdict>({
        client: this.client,
        tier: 'strong',
        system: SYSTEM,
        user,
        maxTokens: 2048,
        temperature: 0,
      });
    } catch {
      // if the agent call fails, fall back to the deterministic verdict alone.
      return deterministic;
    }

    // MERGE: pass only if both pass; union perGate (fail wins) + failures + traces.
    const perGate: EngineVerdict['perGate'] = { ...deterministic.perGate };
    for (const [k, v] of Object.entries(agent.perGate)) {
      const agentPass = v === 'pass';
      const prior = perGate[k];
      perGate[k] = {
        pass: (prior ? prior.pass : true) && agentPass,
        note: agentPass ? (prior?.note ?? 'pass') : `agent: ${v}` + (prior && !prior.pass ? ` | ${prior.note}` : ''),
      };
    }
    const claimTrace: InternalClaimTrace[] = [
      ...deterministic.claimTrace,
      ...agent.claimTrace.filter((c) => !deterministic.claimTrace.some((d) => d.claim === c.claim)),
    ];
    const verdict: 'pass' | 'fail' =
      deterministic.verdict === 'pass' && agent.verdict === 'pass' && Object.values(perGate).every((g) => g.pass)
        ? 'pass'
        : 'fail';

    return { verdict, mode: 'independent', perGate, claimTrace };
  }
}
