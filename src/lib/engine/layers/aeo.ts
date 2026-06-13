// LAYER aeo-check (code + agent fast, toggle, default on)
//
// Applies the inputs/aeo-optimization-skill checks deterministically where we
// can: three-sentence lead, FAQ presence, extractable spec table,
// differentiation (>=1 unique fact/number), one-paragraph test. Blocking
// findings must be fixed before the verifier runs.

import type { AeoFinding, FactRows, PieceDraft } from '../types';
import { stripTags } from '../html';

function firstParagraph(html: string): string {
  const m = html.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
  return m ? stripTags(m[1]) : '';
}

function sentenceCount(text: string): number {
  return text.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 3).length;
}

export function aeoCheck(draft: PieceDraft, facts: FactRows, primaryKeyword: string): AeoFinding[] {
  const findings: AeoFinding[] = [];
  const bodyText = stripTags(draft.html);
  const lead = firstParagraph(draft.html);

  // three-sentence test: who / what / how-different. Heuristic: lead has >=3
  // sentences and mentions the primary keyword.
  const leadOk = sentenceCount(lead) >= 3 && lead.toLowerCase().includes(primaryKeyword.toLowerCase().split(' ')[0]);
  findings.push({
    check: 'three-sentence',
    pass: leadOk,
    blocking: true,
    note: leadOk
      ? `Lead has ${sentenceCount(lead)} sentences and names the topic.`
      : `Lead must answer who/what/how-different in >=3 sentences and name the topic.`,
  });

  // FAQ present
  const hasFaq = /<h2[^>]*>\s*FAQ/i.test(draft.html) || (draft.html.match(/<strong>[^<]*\?/g)?.length ?? 0) >= 2;
  findings.push({
    check: 'faq',
    pass: hasFaq,
    blocking: true,
    note: hasFaq ? 'FAQ section present.' : 'No FAQ with real buyer questions found.',
  });

  // extractable spec table
  const hasTable = /<table[\s>]/i.test(draft.html);
  findings.push({
    check: 'spec-table',
    pass: hasTable,
    blocking: true,
    note: hasTable ? 'Extractable spec table present.' : 'Product rewrite needs an extractable spec table.',
  });

  // differentiation: at least one concrete grounded number/spec the copy states.
  const factValues = facts.filter((f) => f.trust !== 'T3').map((f) => f.value);
  const numbersInBody = bodyText.match(/\d+(?:\.\d+)?/g) ?? [];
  const factBlob = factValues.join(' ');
  const groundedNumber = numbersInBody.some((n) => factBlob.includes(n));
  findings.push({
    check: 'differentiation',
    pass: groundedNumber,
    blocking: true,
    note: groundedNumber
      ? 'Copy includes at least one concrete, grounded number/spec.'
      : 'Copy lacks a concrete, grounded, brand-specific number/spec a competitor could not copy.',
  });

  // extractability: key facts live in body text (not only meta/alt).
  const material = facts.find((f) => f.field === 'material' && f.trust !== 'T3')?.value;
  const extractable = !material || bodyText.toLowerCase().includes(material.toLowerCase().slice(0, 8));
  findings.push({
    check: 'extractability',
    pass: extractable,
    blocking: false,
    note: extractable ? 'Key facts present in body text.' : 'Material fact missing from body text.',
  });

  // one-paragraph test: lead names the topic and at least one spec → summarizable.
  const onePara = leadOk && groundedNumber;
  findings.push({
    check: 'one-paragraph',
    pass: onePara,
    blocking: false,
    note: onePara ? 'An LLM could summarize this in one accurate paragraph.' : 'Tighten lead + specifics for a clean one-paragraph summary.',
  });

  return findings;
}

export function aeoBlockingFailures(findings: AeoFinding[]): AeoFinding[] {
  return findings.filter((f) => f.blocking && !f.pass);
}
