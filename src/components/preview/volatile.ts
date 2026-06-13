// Review-time guardrail: detect VOLATILE fields baked into the static body copy.
//
// Some product facts are true only at snapshot time — availability / stock
// counts change the moment someone buys, and live per-unit prices drift. The
// brief's grounding rule is "never assert something that will not stay true":
// such fields belong in JSON-LD `offers` (re-evaluated live), never frozen into
// prose or the spec table. The engine should not emit them (filed [D->C]); this
// detector is the review-side safety net that surfaces them if it still does.
//
// Pure: HTML in, GuardrailFlag[] out. No DOM, no React, so it runs server-side
// on the review page and is unit-testable. Reuses the same html->text projection
// the anchor math uses, so a flag's quote reads exactly as the reviewer sees it.

import type { GuardrailFlag } from "@/types/contracts";
import { htmlToText } from "./anchor";

export interface VolatileMatch {
  /** What kind of volatile field this is. */
  kind: "availability" | "price";
  /** The offending text as it renders to the reviewer. */
  quote: string;
}

// "20 of 20 variants in stock", "20/20 variants in stock", "12 in stock",
// "in stock", "out of stock", "sold out", "only N left".
const AVAILABILITY = [
  // No leading \b: adjacent table cells project glued ("Availability20 of 20..."),
  // so the digit can abut a label with no word boundary before it.
  /\d+\s*(?:of|\/)\s*\d+\s+variants?\s+in\s+stock\b/i,
  /\b\d+\s+(?:items?|units?|variants?)?\s*(?:left|remaining|in\s+stock|available)\b/i,
  /\b(?:in\s+stock|out\s+of\s+stock|sold\s+out|back\s*order(?:ed)?)\b/i,
  /\bonly\s+\d+\s+left\b/i,
];

// A concrete money amount stated in prose: "$20.00", "20.00 USD", "USD 20".
// We only care about amounts inside running text (sentences), not the spec
// table — a price RANGE in a spec row is defensible; a price restated in a
// sentence is what drifts. The caller decides scope via `priceInProse`.
const MONEY = /(?:[$£€]\s?\d[\d,]*(?:\.\d{2})?)|(?:\b\d[\d,]*(?:\.\d{2})?\s?(?:USD|EUR|GBP)\b)/i;

// A line is "prose" (vs a spec/key:value row) if it reads like a sentence:
// has multiple words and ends with sentence punctuation, or is long enough that
// it is clearly not a table cell.
function looksLikeProse(line: string): boolean {
  const t = line.trim();
  if (t.length < 24) return false;
  const words = t.split(/\s+/).length;
  return words >= 6;
}

export interface DetectOpts {
  /** Also flag concrete prices that appear inside prose sentences. Default true. */
  priceInProse?: boolean;
}

export function detectVolatileMatches(html: string, opts: DetectOpts = {}): VolatileMatch[] {
  const { priceInProse = true } = opts;
  const text = htmlToText(html).text;
  const matches: VolatileMatch[] = [];
  const seen = new Set<string>();

  // Availability is volatile ANYWHERE (spec table or prose) — it should never be
  // on the static page at all, so we scan the whole text line by line.
  for (const rawLine of text.split(/\n+/)) {
    const line = rawLine.trim();
    if (!line) continue;

    for (const re of AVAILABILITY) {
      const m = re.exec(line);
      if (m) {
        // Quote just the matched phrase, not the whole line — adjacent table
        // cells project without a separating space, so the full line can read
        // like "Availability20 of 20 variants in stock".
        const quote = trimQuote(m[0]);
        if (!seen.has("a:" + quote)) {
          seen.add("a:" + quote);
          matches.push({ kind: "availability", quote });
        }
        break;
      }
    }

    // Price is only a problem when restated in a prose sentence (drift), not in
    // a spec row where a range is the canonical, expected place for it.
    if (priceInProse && looksLikeProse(line) && MONEY.test(line)) {
      const quote = trimQuote(line);
      if (!seen.has("p:" + quote)) {
        seen.add("p:" + quote);
        matches.push({ kind: "price", quote });
      }
    }
  }

  return matches;
}

// Build review-panel guardrail flags from the matches. Availability is BAD
// (must not ship on a static page); price-in-prose is WARN (reviewer judgment).
export function detectVolatileFlags(html: string, opts: DetectOpts = {}): GuardrailFlag[] {
  const matches = detectVolatileMatches(html, opts);
  return matches.map((m) =>
    m.kind === "availability"
      ? {
          type: "other",
          severity: "BAD",
          note: `Volatile field in copy: "${m.quote}". Stock/availability changes as people buy; it must not be frozen into the page. Remove it from the body and keep availability in JSON-LD offers only.`,
        }
      : {
          type: "other",
          severity: "WARN",
          note: `Live price restated in prose: "${m.quote}". Prices drift; consider keeping the price only in the spec table (as a range) and JSON-LD, not in sentences.`,
        },
  );
}

function trimQuote(s: string): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > 100 ? t.slice(0, 99) + "…" : t;
}
