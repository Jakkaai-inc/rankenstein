// Anchor math for review comments. Pure, no DOM, no React — runs identically on
// the client (computing a span anchor from a selection) and the server (splicing
// the edited span back in, and diff-verifying that nothing else moved).
//
// The whole review loop hinges on ONE invariant: an offset computed against the
// browser's `textContent` must mean the same character on the server. So this
// module produces a plain-text projection of the HTML that matches what a
// browser renders for `textContent` (tags removed, entities decoded, whitespace
// kept verbatim) AND a char-level map back into the raw HTML string. With that
// map, a [start,end) text range slices cleanly to an HTML substring.

import type { CommentAnchor } from "@/types/contracts";

const NAMED: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

function decodeEntity(body: string): string | null {
  if (body[0] === "#") {
    const num = body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
    if (!Number.isFinite(num)) return null;
    try {
      return String.fromCodePoint(num);
    } catch {
      return null;
    }
  }
  return NAMED[body.toLowerCase()] ?? null;
}

export interface TextProjection {
  /** Plain text as a browser's textContent would expose it. */
  text: string;
  /** map[i] = index in `html` where text char i begins. map[text.length] = html.length. */
  map: number[];
}

// Walk the HTML once: skip tags and script/style bodies, decode entities, and
// for every emitted text char record the html offset where it started.
export function htmlToText(html: string): TextProjection {
  const text: string[] = [];
  const map: number[] = [];
  let i = 0;
  const n = html.length;
  while (i < n) {
    const c = html[i];
    if (c === "<") {
      // Skip a tag. Drop the bodies of <script>/<style> wholesale (textContent omits them).
      const tagMatch = /^<\s*(\/?)\s*([a-zA-Z][a-zA-Z0-9]*)/.exec(html.slice(i, i + 32));
      const end = html.indexOf(">", i);
      const close = end === -1 ? n : end + 1;
      const tag = tagMatch?.[2]?.toLowerCase();
      if ((tag === "script" || tag === "style") && tagMatch?.[1] !== "/") {
        const re = new RegExp(`</\\s*${tag}\\s*>`, "i");
        const m = re.exec(html.slice(close));
        i = m ? close + m.index + m[0].length : n;
      } else {
        i = close;
      }
      continue;
    }
    if (c === "&") {
      const semi = html.indexOf(";", i + 1);
      if (semi !== -1 && semi - i <= 10) {
        const decoded = decodeEntity(html.slice(i + 1, semi));
        if (decoded !== null) {
          for (const ch of decoded) {
            text.push(ch);
            map.push(i);
          }
          i = semi + 1;
          continue;
        }
      }
    }
    text.push(c);
    map.push(i);
    i++;
  }
  map.push(n);
  return { text: text.join(""), map };
}

export interface HtmlSlice {
  before: string;
  target: string;
  after: string;
}

// Slice the raw HTML at a [start,end) plain-text range. `target` is the HTML
// substring whose rendered text is the selected span (may carry inline tags if
// the selection crossed them). Splicing a replacement for `target` changes only
// that span and leaves before/after byte-identical.
export function sliceByText(html: string, start: number, end: number, proj?: TextProjection): HtmlSlice {
  const p = proj ?? htmlToText(html);
  const s = clamp(start, 0, p.text.length);
  const e = clamp(end, s, p.text.length);
  const hStart = p.map[s];
  const hEnd = p.map[e];
  return { before: html.slice(0, hStart), target: html.slice(hStart, hEnd), after: html.slice(hEnd) };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export interface ResolvedSpan {
  start: number;
  end: number;
  quote: string;
}

// Re-anchor a stored comment against the CURRENT text. Offsets drift as the piece
// is edited, so we trust them only if they still frame the exact quote; otherwise
// we relocate by the quoted text. Returns null for global anchors or lost quotes.
export function resolveAnchor(text: string, anchor: CommentAnchor): ResolvedSpan | null {
  if (anchor.mode !== "span") return null;
  const quote = anchor.textQuote ?? "";
  if (!quote) {
    if (typeof anchor.startOffset === "number" && typeof anchor.endOffset === "number") {
      return { start: anchor.startOffset, end: anchor.endOffset, quote: text.slice(anchor.startOffset, anchor.endOffset) };
    }
    return null;
  }
  // 1) Offsets still valid?
  if (typeof anchor.startOffset === "number" && text.slice(anchor.startOffset, anchor.startOffset + quote.length) === quote) {
    return { start: anchor.startOffset, end: anchor.startOffset + quote.length, quote };
  }
  // 2) Unique relocate by exact quote.
  const first = text.indexOf(quote);
  if (first !== -1) {
    const second = text.indexOf(quote, first + 1);
    if (second === -1) return { start: first, end: first + quote.length, quote };
    // 3) Ambiguous: pick the occurrence nearest the original offset.
    if (typeof anchor.startOffset === "number") {
      let best = first;
      let bestDist = Math.abs(first - anchor.startOffset);
      let idx = second;
      while (idx !== -1) {
        const d = Math.abs(idx - anchor.startOffset);
        if (d < bestDist) {
          best = idx;
          bestDist = d;
        }
        idx = text.indexOf(quote, idx + 1);
      }
      return { start: best, end: best + quote.length, quote };
    }
    return { start: first, end: first + quote.length, quote };
  }
  // 4) Whitespace-tolerant relocate. The stored quote comes from the browser's
  // Selection.toString(), which inserts whitespace (newlines/tabs) at block and
  // table-cell boundaries that the textContent projection does not contain (and
  // vice versa) — so a span selected across two table cells never matches by
  // exact substring. Collapse every whitespace run on both sides and search in
  // that normalized space, then map the hit back to real offsets.
  return relocateNormalized(text, quote, anchor.startOffset);
}

// Strip ALL whitespace, recording for each kept (non-whitespace) char the index
// in `text` where it lives. Selection.toString() both adds whitespace the
// projection lacks (at cell boundaries) and can drop whitespace the projection
// has, so the only reliable common ground is the non-whitespace skeleton.
function stripWhitespace(text: string): { compact: string; map: number[] } {
  const compact: string[] = [];
  const map: number[] = [];
  for (let i = 0; i < text.length; i++) {
    if (!/\s/.test(text[i])) {
      compact.push(text[i]);
      map.push(i);
    }
  }
  return { compact: compact.join(""), map };
}

function relocateNormalized(text: string, quote: string, near?: number): ResolvedSpan | null {
  const nq = quote.replace(/\s+/g, "");
  if (!nq) return null;
  const { compact, map } = stripWhitespace(text);
  const hits: number[] = [];
  let idx = compact.indexOf(nq);
  while (idx !== -1) {
    hits.push(idx);
    idx = compact.indexOf(nq, idx + 1);
  }
  if (hits.length === 0) return null;
  // Pick the occurrence nearest the original offset when ambiguous.
  let chosen = hits[0];
  if (hits.length > 1 && typeof near === "number") {
    let bestDist = Infinity;
    for (const h of hits) {
      const d = Math.abs(map[h] - near);
      if (d < bestDist) {
        bestDist = d;
        chosen = h;
      }
    }
  }
  const start = map[chosen];
  const end = map[chosen + nq.length - 1] + 1; // last non-whitespace char of the match + 1
  return { start, end, quote: text.slice(start, end) };
}
