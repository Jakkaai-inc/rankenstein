// LAYER outline+critic (agents strong+fast, required - articles)
//
// ENFORCED loop: generate outline -> adversarial critic returns pass|revise+issues
// -> regenerate fixing EVERY issue -> cap 3 rounds -> NEVER draft on a failing
// outline (hard stop, surface issues). The loop control is deterministic code;
// the outline + critic are injected providers (offline fixture + deterministic
// critic here; live agents in prod).

import type { Angle, Outline, OutlineCritique, SerpOwnership } from '../types';
import type { OutlineProvider, OutlineCritic } from '../providers';

export class FixtureOutlineProvider implements OutlineProvider {
  constructor(private readonly value: Outline) {}
  async outline(): Promise<Outline> {
    return this.value;
  }
}

/** Deterministic completeness critic (stands in for the fast-tier agent). */
export class DeterministicCritic implements OutlineCritic {
  async critique(outline: Outline): Promise<OutlineCritique> {
    const issues: string[] = [];
    if (!outline.title || outline.title.length < 8) issues.push('title missing or too short');
    if (!outline.metaTitle || outline.metaTitle.length > 62) issues.push('metaTitle missing or over 62 chars');
    if (!outline.metaDesc || outline.metaDesc.length > 155) issues.push('metaDesc missing or over 155 chars');
    if (!outline.slug || outline.slug.split('-').filter(Boolean).length > 5) issues.push('slug missing or over 5 words');
    if (!outline.hook || outline.hook.length < 20) issues.push('hook missing or too short');
    if (!outline.sections || outline.sections.length < 3) issues.push('need at least 3 sections');
    for (const s of outline.sections ?? []) {
      if (!s.h2) issues.push('a section is missing its h2');
      if (!s.reason) issues.push(`section "${s.h2 ?? '?'}" missing a reason`);
      if (!s.bullets || s.bullets.length < 1) issues.push(`section "${s.h2 ?? '?'}" needs at least one bullet`);
    }
    if (!outline.faqs || outline.faqs.length < 2) issues.push('need at least 2 FAQs');
    return { verdict: issues.length === 0 ? 'pass' : 'revise', issues };
  }
}

export type OutlineLoopResult =
  | { status: 'pass'; outline: Outline; rounds: number }
  | { status: 'fail'; issues: string[]; rounds: number };

/**
 * The enforced outline->critic loop. Returns pass with the approved outline, or
 * fail with the outstanding issues after `maxRounds` (the orchestrator then hard
 * stops and never drafts).
 */
export async function runOutlineLoop(
  provider: OutlineProvider,
  critic: OutlineCritic,
  angle: Angle,
  keywords: string[],
  wordTarget: { min: number; max: number },
  serp: SerpOwnership[],
  maxRounds = 3,
): Promise<OutlineLoopResult> {
  let priorIssues: string[] | undefined;
  let outline = await provider.outline(angle, keywords, wordTarget, priorIssues);
  for (let round = 1; round <= maxRounds; round++) {
    const crit = await critic.critique(outline, serp);
    if (crit.verdict === 'pass') return { status: 'pass', outline, rounds: round };
    if (round === maxRounds) return { status: 'fail', issues: crit.issues, rounds: round };
    priorIssues = crit.issues;
    outline = await provider.outline(angle, keywords, wordTarget, priorIssues);
  }
  // unreachable, but keeps the type checker happy
  return { status: 'fail', issues: ['outline loop exhausted'], rounds: maxRounds };
}
