// Adapters — convert engine-private results into the frozen contract shapes.
// The contract types (src/types/contracts.ts) are the law at the engine boundary.

import type {
  ContentBrief,
  DataSource,
  EngineVerdict,
  FactsTable,
  GateViolation,
  GroundResult,
  PieceDraft,
  Selection,
  VerifierVerdict,
  Violation,
} from './types';

/** GroundResult → contract FactsTable {rows, gaps, provenanceFlags}. */
export function toContractFactsTable(g: GroundResult): FactsTable {
  return {
    rows: g.facts,
    gaps: g.gaps.map((x) => `${x.field}: ${x.note}`),
    provenanceFlags: g.provenanceFlags.map((f) => f.note),
  };
}

/** Rich EngineVerdict → contract VerifierVerdict. */
export function toContractVerdict(v: EngineVerdict): VerifierVerdict {
  const perGate: Record<string, string> = {};
  for (const [k, g] of Object.entries(v.perGate)) {
    perGate[k] = g.pass ? 'pass' : `fail: ${g.note}`;
  }
  const failures: string[] = [];
  for (const [k, g] of Object.entries(v.perGate)) if (!g.pass) failures.push(`${k}: ${g.note}`);
  for (const c of v.claimTrace) if (!c.grounded) failures.push(`ungrounded claim "${c.claim}" traces to no T1/T2 fact`);

  return {
    verdict: v.verdict,
    isSelfCheck: v.mode === 'self-check',
    perGate,
    // contract ClaimTrace requires source+trust; include only grounded traces.
    claimTrace: v.claimTrace
      .filter((c) => c.grounded && c.source && c.trust)
      .map((c) => ({ claim: c.claim, source: c.source as string, trust: c.trust as 'T1' | 'T2' | 'T3' })),
    failures,
  };
}

/** Engine gate violations → contract Violation[] (4 categories). */
export function toContractViolations(gv: GateViolation[]): Violation[] {
  const brandVoice = new Set(['em-dash', 'emoji-heading', 'banned-word']);
  return gv.map((v) => ({
    gate: brandVoice.has(v.gate) ? 'brand-voice' : 'structure',
    message: `${v.gate}: ${v.detail}`,
  }));
}

/** Build the contract ContentBrief from the selection + ground + computed count. */
export function toContractBrief(args: {
  selection: Selection;
  ground: GroundResult;
  wordTargetMax: number;
  wordCount: number;
}): ContentBrief {
  const { selection, wordTargetMax, wordCount } = args;
  const p = selection.primary;
  const serp = p.serp;
  const serpNote = serp
    ? `Top SERP owned by ${serp.owners.join(', ') || 'n/a'} (avg DR ${serp.avgDR ?? 'unknown'}); winnable for this site: ${serp.winnable}.`
    : 'No SERP-ownership data for the primary keyword.';

  return {
    primaryKeyword: { keyword: p.candidate.keyword, volume: p.candidate.volume, kd: p.candidate.kd },
    secondaryKeywords: selection.secondaries.map((s) => ({ keyword: s.candidate.keyword, volume: s.candidate.volume })),
    keywordDataSource: p.candidate.source as DataSource,
    serpOwnershipNote: serpNote,
    wordTarget: wordTargetMax,
    wordCount,
    historyDecision: selection.historyDecision,
    exclusions: selection.exclusions.map((e) => ({ keyword: e.keyword, reason: e.routedTo })),
  };
}

/** The JSON-LD object as the contract's `unknown` jsonld field. */
export function jsonldOf(draft: PieceDraft): unknown {
  return draft.jsonld;
}
