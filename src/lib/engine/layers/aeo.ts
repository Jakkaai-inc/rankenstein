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

export function aeoCheck(
  draft: PieceDraft,
  facts: FactRows,
  primaryKeyword: string,
  kind: 'product' | 'article' = 'product',
): AeoFinding[] {
  const findings: AeoFinding[] = [];
  const bodyText = stripTags(draft.html);
  const lead = firstParagraph(draft.html);

  // three-sentence test: who / what / how-different. Heuristic: lead has >=3
  // sentences and mentions a significant token from the primary keyword.
  const kwTokens = primaryKeyword.toLowerCase().split(/\s+/).filter((t) => t.length > 3);
  const leadMentionsTopic = kwTokens.length === 0 || kwTokens.some((t) => lead.toLowerCase().includes(t));
  const leadOk = sentenceCount(lead) >= 3 && leadMentionsTopic;
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

  // extractable spec table (product rewrites only)
  if (kind === 'product') {
    const hasTable = /<table[\s>]/i.test(draft.html);
    findings.push({
      check: 'spec-table',
      pass: hasTable,
      blocking: true,
      note: hasTable ? 'Extractable spec table present.' : 'Product rewrite needs an extractable spec table.',
    });
  }

  // differentiation: at least one concrete number/spec the copy states. For
  // products it must trace to an internal fact; for articles a cited number
  // (inline link) counts, since article facts live in external sources.
  const factValues = facts.filter((f) => f.trust !== 'T3').map((f) => f.value);
  const numbersInBody = bodyText.match(/\d+(?:\.\d+)?/g) ?? [];
  const factBlob = factValues.join(' ');
  const groundedNumber = numbersInBody.some((n) => factBlob.includes(n));
  const hasCitation = /<a [^>]*href=/i.test(draft.html);
  const differentiated = kind === 'article' ? groundedNumber || (numbersInBody.length > 0 && hasCitation) : groundedNumber;
  findings.push({
    check: 'differentiation',
    pass: differentiated,
    blocking: true,
    note: differentiated
      ? 'Copy includes at least one concrete number/spec (grounded or cited).'
      : 'Copy lacks a concrete, brand-specific number/spec a competitor could not copy.',
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
