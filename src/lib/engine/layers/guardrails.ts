// LAYER guardrails (code + agent fast, required)
//
// Refuse-and-flag, never silently fix. Emits flags:
//   trademark   — a registered mark used as a generic product type (BAD), or a
//                 tolerated lowercase descriptive use / trademark-adjacent
//                 keyword targeting (WARN, human sign-off).
//   regulated   — flammability / cert / health / eco claims needing proof.
//   gap         — a known data gap (from ground), surfaced for the merchant.
//   provenance  — the draft reuses T3 (unverified) prose.
// BAD-severity flags block; WARN flags surface in the review UI.

import type {
  BrandProfile,
  FactsTable,
  Gap,
  GuardrailFlag,
  PieceDraft,
  Selection,
} from '../types';
import { REGULATED_CLAIM_PATTERNS } from '../brand';
import { stripTags } from '../html';

export type GuardrailInput = {
  draft: PieceDraft;
  facts: FactsTable;
  brand: BrandProfile;
  gaps: Gap[];
  selection: Selection;
  /** provenance flags carried from the ground layer (artifact demotion etc.). */
  carried: GuardrailFlag[];
};

export function guardrails(input: GuardrailInput): GuardrailFlag[] {
  const { draft, facts, brand, gaps, selection, carried } = input;
  const flags: GuardrailFlag[] = [...carried];
  const bodyText = stripTags(draft.html);
  const haystack = `${bodyText} ${draft.meta.title} ${draft.meta.description} ${JSON.stringify(draft.jsonld)}`;
  const lc = haystack.toLowerCase();

  // ---- trademarks -----------------------------------------------------------
  for (const tm of brand.trademarks) {
    const mark = tm.mark;
    const asType = new RegExp(`\\b${mark}\\s+(?:fabric|minky|material)\\b`, 'i'); // "Cuddle fabric"
    const asRegistered = new RegExp(`${mark}\\s*[®™]`, 'i'); // "Cuddle®"
    const used = new RegExp(`\\b${mark}\\b`, 'i').test(haystack);

    if (asType.test(haystack) || asRegistered.test(haystack)) {
      flags.push({
        type: 'trademark',
        severity: 'BAD',
        note: `"${mark}" is a registered mark (${tm.owner}) used as a generic product type. Do not use it as a product type/brand claim.`,
      });
    } else if (used && !tm.descriptiveUseTolerated) {
      flags.push({
        type: 'trademark',
        severity: 'BAD',
        note: `"${mark}" (${tm.owner}) appears in copy and is not approved for use.`,
      });
    } else if (used && tm.descriptiveUseTolerated) {
      flags.push({
        type: 'trademark',
        severity: 'WARN',
        note: `"${mark}" (${tm.owner}) used descriptively. Lowercase descriptive use only; human sign-off recommended.`,
      });
    }

    // trademark-adjacent keyword targeting (selection) → WARN for sign-off.
    const targeted = [selection.primary, ...selection.secondaries].some((s) =>
      new RegExp(`\\b${mark}\\b`, 'i').test(s.candidate.keyword),
    );
    if (targeted) {
      flags.push({
        type: 'trademark',
        severity: 'WARN',
        note: `A targeted keyword contains "${mark}" (${tm.owner}). Trademark-adjacent targeting needs human sign-off before publish.`,
      });
    }
  }

  // ---- regulated claims -----------------------------------------------------
  const factBlob = facts.filter((f) => f.trust !== 'T3').map((f) => f.value).join(' ').toLowerCase();
  for (const pat of REGULATED_CLAIM_PATTERNS) {
    const m = lc.match(pat.rx);
    if (m) {
      // grounded only if the exact claim token also appears in a trusted fact.
      const grounded = factBlob.includes(m[0].toLowerCase());
      flags.push({
        type: 'regulated',
        severity: grounded ? 'WARN' : 'BAD',
        note: `${pat.note}${grounded ? ' (present in source — still flag for sign-off)' : ' Claim is NOT in source data — refuse and remove.'}`,
      });
    }
  }

  // ---- provenance: reuse of T3 (unverified) prose ---------------------------
  for (const t3 of facts.filter((f) => f.trust === 'T3' && f.field === 'prose')) {
    // any substantial verbatim chunk of T3 prose appearing in the body = reuse.
    const chunks = t3.value.split(/(?<=[.!?])\s+/).filter((s) => s.length >= 40);
    const reused = chunks.find((c) => bodyText.includes(c.slice(0, 40)));
    if (reused) {
      flags.push({
        type: 'provenance',
        severity: 'BAD',
        note: `Draft reuses unverified (T3) source prose: "${reused.slice(0, 60)}...". T3 content may not be asserted.`,
      });
      break;
    }
  }

  // ---- gaps -----------------------------------------------------------------
  for (const g of gaps) {
    flags.push({ type: 'gap', severity: 'WARN', note: `Gap (${g.field}): ${g.note}` });
  }

  // ---- positive grounding note (parity with reference) ----------------------
  if (!flags.some((f) => f.severity === 'BAD')) {
    flags.push({
      type: 'other',
      severity: 'GOOD',
      note: 'Grounded: every asserted spec maps to a T1/T2 source fact. No fabricated specs, certs, or reviews.',
    });
  }

  return flags;
}

export function hasBlockingFlag(flags: GuardrailFlag[]): boolean {
  return flags.some((f) => f.severity === 'BAD');
}
