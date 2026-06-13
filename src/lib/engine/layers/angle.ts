// LAYER angle (agent strong-tier panel, toggle - articles)
//
// Produces 4 lens angles (contrarian | data-led | buyer-decision | maker-pain)
// and a chosen one. PASS: the chosen angle is specific enough to be an email
// subject line (deterministic check). Engine calls an injected AngleProvider;
// offline we use a fixture.

import type { Angle, AngleSet } from '../types';
import type { AngleProvider } from '../providers';

export class FixtureAngleProvider implements AngleProvider {
  constructor(private readonly set: AngleSet) {}
  async angles(): Promise<AngleSet> {
    return this.set;
  }
}

/** Subject-line specificity check: concrete enough to open an email with. */
export function angleIsSubjectLine(angle: Angle): boolean {
  const h = angle.headline.trim();
  const words = h.split(/\s+/).filter(Boolean);
  const generic = /^(guide|overview|introduction|everything you need to know)\b/i.test(h);
  // 4-14 words, 20-90 chars, not a bare generic label.
  return words.length >= 4 && words.length <= 16 && h.length >= 20 && h.length <= 90 && !generic;
}

/** PASS check for the angle layer: chosen angle must be subject-line specific. */
export function validateAngle(set: AngleSet): { ok: boolean; issue?: string } {
  if (!set.chosen) return { ok: false, issue: 'no angle chosen' };
  if (!angleIsSubjectLine(set.chosen)) {
    return { ok: false, issue: `chosen angle is not subject-line specific: "${set.chosen.headline}"` };
  }
  return { ok: true };
}
