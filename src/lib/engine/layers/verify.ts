// LAYER verify (strong-tier agent, FRESH CONTEXT, required)
//
// Grades a finished piece against RUBRIC Part A and returns a claim trace. In
// automated runs this MUST be an INDEPENDENT context (an agent that did not write
// the piece) — the pipeline injects that. Offline / dry runs use the
// SelfCheckVerifier below, whose verdict is labeled "self-check" and, per the
// contract, never satisfies the layer's PASS on its own.
//
// The grounding check is the demo's hero: every number, certification, and
// review claim in the final piece is traced to a T1/T2 fact. Anything that
// traces to nothing (a fabricated GSM, an invented OEKO-TEX cert, a made-up
// review count) fails the piece.

import type {
  InternalClaimTrace,
  FactRows,
  PieceDraft,
  EngineVerdict,
} from '../types';
import type { Verifier } from '../providers';
import { countH1, findEmDashes, stripTags } from '../html';

const CERT_RE = /\b(GOTS|OEKO-?TEX|GREENGUARD|bluesign|FSC|fair\s?trade)\b/gi;
const REVIEW_TEXT_RE = /\b(rated|reviews?|ratings?|stars?)\b/i;

function trustedFactBlob(facts: FactRows): { blob: string; fields: { field: string; value: string; trust: 'T1' | 'T2' }[] } {
  const fields = facts
    .filter((f) => f.trust === 'T1' || f.trust === 'T2')
    .map((f) => ({ field: f.field, value: f.value, trust: f.trust as 'T1' | 'T2' }));
  return { blob: fields.map((f) => f.value).join(' ').toLowerCase(), fields };
}

function traceNumber(num: string, fields: { field: string; value: string; trust: 'T1' | 'T2' }[]): InternalClaimTrace {
  const hit = fields.find((f) => f.value.toLowerCase().includes(num.toLowerCase()));
  return hit
    ? { claim: num, source: `${hit.field} ("${hit.value}")`, trust: hit.trust, grounded: true }
    : { claim: num, source: null, trust: null, grounded: false };
}

/** Pure grader. mode is stamped by the caller (independent vs self-check). */
export function gradePiece(piece: PieceDraft, facts: FactRows, mode: 'independent' | 'self-check'): EngineVerdict {
  const { fields } = trustedFactBlob(facts);
  const bodyText = stripTags(piece.html);
  const ld = JSON.stringify(piece.jsonld);
  const surface = `${bodyText} ${piece.meta.title} ${piece.meta.description} ${ld}`;
  const reviewsPresent = facts.find((f) => f.field === 'reviews.present')?.value === 'true';

  const claimTrace: InternalClaimTrace[] = [];

  // ---- numeric claims -------------------------------------------------------
  const numbers: string[] = [
    ...(bodyText.match(/\d+(?:\.\d+)?/g) ?? []),
    ...(piece.meta.description.match(/\d+(?:\.\d+)?/g) ?? []),
  ];
  const seen = new Set<string>();
  for (const n of numbers) {
    if (seen.has(n)) continue;
    seen.add(n);
    claimTrace.push(traceNumber(n, fields));
  }
  const ungroundedNumbers = claimTrace.filter((c) => !c.grounded).map((c) => c.claim);

  // ---- certification claims -------------------------------------------------
  const certHits = [...surface.matchAll(CERT_RE)].map((m) => m[0]);
  const ungroundedCerts: string[] = [];
  for (const cert of certHits) {
    const grounded = fields.some((f) => f.value.toLowerCase().includes(cert.toLowerCase()));
    claimTrace.push({ claim: cert, source: grounded ? 'source fact' : null, trust: grounded ? 'T2' : null, grounded });
    if (!grounded) ungroundedCerts.push(cert);
  }

  // ---- review/rating claims -------------------------------------------------
  const jsonldHasRating = /aggregateRating/i.test(ld);
  const bodyHasReview = REVIEW_TEXT_RE.test(bodyText) && /\d/.test(bodyText);
  const fabricatedReviews = (jsonldHasRating || bodyHasReview) && !reviewsPresent;
  if (jsonldHasRating || bodyHasReview) {
    claimTrace.push({
      claim: 'review/rating data',
      source: reviewsPresent ? 'reviews present in source' : null,
      trust: null,
      grounded: reviewsPresent,
    });
  }

  // ---- em dash --------------------------------------------------------------
  const hasEmDash = findEmDashes(surface);

  // ---- per-gate verdicts (RUBRIC Part A subset the verifier owns) -----------
  const a1Grounding = ungroundedNumbers.length === 0 && ungroundedCerts.length === 0;
  const a3Structured =
    !fabricatedReviews && isParseable(piece.jsonld);
  const a4Voice = !hasEmDash;
  const a2Structure = countH1(piece.html) === 1 && /<table[\s>]/i.test(piece.html) && /<h2[^>]*>\s*FAQ/i.test(piece.html);

  const perGate: EngineVerdict['perGate'] = {
    'A1.grounding': {
      pass: a1Grounding,
      note: a1Grounding
        ? 'Every numeric/cert claim traces to a T1/T2 fact.'
        : `Ungrounded claims: ${[...ungroundedNumbers, ...ungroundedCerts].join(', ')}.`,
    },
    'A2.aeo-structure': {
      pass: a2Structure,
      note: a2Structure ? 'One h1, spec table, and FAQ present.' : 'Missing h1/table/FAQ structure.',
    },
    'A3.structured-data': {
      pass: a3Structured,
      note: fabricatedReviews
        ? 'aggregateRating/review claim present but no review data exists in source.'
        : 'JSON-LD parses; no fabricated review data.',
    },
    'A4.brand-voice': {
      pass: a4Voice,
      note: a4Voice ? 'No em dashes.' : 'Em dash present in emitted content.',
    },
  };

  const verdict = Object.values(perGate).every((g) => g.pass) ? 'pass' : 'fail';
  return { verdict, mode, perGate, claimTrace };
}

function isParseable(obj: Record<string, unknown>): boolean {
  try {
    JSON.parse(JSON.stringify(obj));
    return true;
  } catch {
    return false;
  }
}

/** Offline verifier. Its verdict is labeled "self-check" and never satisfies
 *  the layer PASS in automated runs (the pipeline enforces that). */
export class SelfCheckVerifier implements Verifier {
  readonly mode = 'self-check' as const;
  async verify(piece: PieceDraft, facts: FactRows): Promise<EngineVerdict> {
    return gradePiece(piece, facts, 'self-check');
  }
}

/** Wrap an independent grader (e.g. a fresh-context agent) behind the interface.
 *  Provided so prod can inject a real independent verifier while reusing the
 *  same deterministic grounding math as a backstop. */
export class IndependentVerifier implements Verifier {
  readonly mode = 'independent' as const;
  constructor(private readonly grader?: (piece: PieceDraft, facts: FactRows) => Promise<EngineVerdict>) {}
  async verify(piece: PieceDraft, facts: FactRows): Promise<EngineVerdict> {
    if (this.grader) return this.grader(piece, facts);
    return gradePiece(piece, facts, 'independent');
  }
}
