// Surgical edit + span-diff verify — the review loop's safety property in code.
//
// A reviewer comments on specific spans. We rewrite ONLY those spans (a
// deterministic splice at mapped offsets, never a whole-document regenerate) and
// then PROVE it: an independent plain-text diff re-derives every region that
// actually changed and asserts each one falls inside a commented span. If any
// untouched section moved, `surgical` is false and the write is refused upstream.
//
// The splicer and the verifier share no state — the verifier does not trust the
// splicer, it re-checks the bytes. That separation is the whole point.

import type { FeedbackSet, ReviewComment, SurgicalEditResult } from "@/types/contracts";
import { htmlToText, resolveAnchor, sliceByText, type ResolvedSpan, type HtmlSlice } from "@/components/preview/anchor";

// Injected so this stays pure/testable; live runs pass an Anthropic-backed fn.
export interface SpanEdit {
  /** The HTML of the commented span (may include inline tags). */
  targetHtml: string;
  /** The selected plain text. */
  quote: string;
  /** The reviewer's instruction. */
  instruction: string;
}
export type SpanEditFn = (e: SpanEdit) => Promise<string>;

interface PlannedEdit {
  comment: ReviewComment;
  span: ResolvedSpan;
}

// Why a commented span ended the way it did — so the UI reports each comment's
// fate, not just an aggregate "N rewritten".
//   applied     — the AI editor rewrote the span
//   override    — the reviewer supplied literal replacement text (human assertion,
//                 bypasses the no-fabrication guard; deterministic splice)
//   no-change   — the editor ran but returned the span unchanged (often a refusal
//                 to assert a fact not in the grounded source)
//   skipped     — could not re-anchor, or overlapped another span this pass
//   error       — the editor threw
export type SpanReason = "applied" | "override" | "no-change" | "skipped" | "error";

// What actually changed for one comment — so the UI can show before -> after
// instead of a blind "trust me" banner, and so a no-op (editor returned the
// span unchanged) is reported honestly rather than as a success.
export interface SpanChange {
  commentId: string;
  before: string;
  after: string;
  changed: boolean;
  reason: SpanReason;
  note?: string; // reviewer-facing explanation (e.g. why it refused)
}

// A reviewer can force exact replacement text, bypassing the AI + its
// no-fabrication guard. They are asserting it themselves. Recognized forms
// (case-insensitive), the rest of the line/comment is the literal text:
//   "replace with: <text>"   "replace with <text>"   "set to: <text>"
// Returns the literal replacement (may be empty string to delete) or null.
const OVERRIDE_RE = /^\s*(?:replace\s+(?:this\s+)?with|set\s+(?:this\s+)?to)\s*:?\s*([\s\S]*)$/i;
export function parseOverride(body: string): string | null {
  const m = OVERRIDE_RE.exec(body);
  if (!m) return null;
  // Strip surrounding quotes a reviewer might add.
  return m[1].trim().replace(/^["']|["']$/g, "");
}

// Superset of the frozen SurgicalEditResult contract. The canonical fields
// (newHtml/perComment/surgical/untouchedSectionsChanged) are unchanged; we add
// `edits` (per-span before/after) and `changed` (count that actually moved).
export interface SurgicalEditDetail extends SurgicalEditResult {
  edits: SpanChange[];
  changed: number;
}

export async function surgicalEditPiece(
  html: string,
  feedback: FeedbackSet,
  edit: SpanEditFn,
): Promise<SurgicalEditDetail> {
  const proj = htmlToText(html);
  const perComment: SurgicalEditResult["perComment"] = [];
  const planned: PlannedEdit[] = [];
  const edits: SpanChange[] = [];

  for (const c of feedback.comments) {
    if (c.anchor.mode === "global") {
      perComment.push({ commentId: c.id, resolution: "noted (global comment — not a surgical span edit; address inline)" });
      edits.push({ commentId: c.id, before: c.anchor.textQuote ?? "", after: c.anchor.textQuote ?? "", changed: false, reason: "skipped", note: "general comment — not tied to a span" });
      continue;
    }
    const span = resolveAnchor(proj.text, c.anchor);
    if (!span) {
      perComment.push({ commentId: c.id, resolution: "skipped — could not re-anchor the quoted span in the current draft" });
      edits.push({ commentId: c.id, before: c.anchor.textQuote ?? "", after: c.anchor.textQuote ?? "", changed: false, reason: "skipped", note: "the quoted text no longer appears in this version" });
      continue;
    }
    planned.push({ comment: c, span });
  }

  // Earliest first, then drop edits whose spans overlap an already-accepted one.
  planned.sort((a, b) => a.span.start - b.span.start);
  const accepted: PlannedEdit[] = [];
  let lastEnd = -1;
  for (const p of planned) {
    if (p.span.start < lastEnd) {
      perComment.push({ commentId: p.comment.id, resolution: "skipped — span overlaps another commented span in the same pass" });
      edits.push({ commentId: p.comment.id, before: p.span.quote, after: p.span.quote, changed: false, reason: "skipped", note: "overlaps another commented span in the same pass — apply it on its own next round" });
      continue;
    }
    accepted.push(p);
    lastEnd = p.span.end;
  }

  // Splice right-to-left so earlier offsets stay valid as we mutate the string.
  let newHtml = html;
  const allowed: { start: number; end: number }[] = [];
  for (let k = accepted.length - 1; k >= 0; k--) {
    const { comment, span } = accepted[k];
    const rawSlice = sliceByText(newHtml, span.start, span.end, k === accepted.length - 1 ? proj : undefined);
    // A span ending at the document's final text char swallows the trailing tag
    // (e.g. "...formats.</p>"). Move boundary tag markup out of the target into
    // before/after so the editor only ever sees inner content and cannot drop
    // structural tags. The splice re-attaches them verbatim.
    const slice = peelBoundaryTags(rawSlice);

    // Human override: literal replacement text bypasses the AI + grounding guard.
    const override = parseOverride(comment.body);
    let replacement: string;
    let reason: SpanReason;
    if (override !== null) {
      replacement = override;
      reason = "override";
    } else {
      try {
        replacement = await edit({ targetHtml: slice.target, quote: span.quote, instruction: comment.body });
        reason = "applied";
      } catch (err) {
        perComment.push({ commentId: comment.id, resolution: `edit failed — left unchanged (${(err as Error).message})` });
        edits.push({ commentId: comment.id, before: htmlToText(slice.target).text.trim(), after: htmlToText(slice.target).text.trim(), changed: false, reason: "error", note: (err as Error).message });
        continue;
      }
    }
    // Honest no-op handling: if the editor returned the span unchanged, do not
    // claim it was rewritten and do not count it as a change. Compare RENDERED
    // text, not raw HTML — the editor returns plain text while the sliced target
    // may carry trailing/leading inline tags (e.g. a span ending in "</p>"); a
    // raw-string compare would both miscount a no-op AND drop that tag.
    const beforeText = htmlToText(slice.target).text.trim();
    const afterText = htmlToText(replacement).text.trim();
    const changed = afterText !== beforeText;
    if (!changed) {
      // An AI no-op is usually a refusal to assert something not in the source.
      const note =
        reason === "override"
          ? "your replacement text matched the existing span — nothing to change"
          : "the editor made no change — usually a refusal to add a fact that is not in the grounded source. Rephrase, or force exact text with \"replace with: ...\".";
      perComment.push({ commentId: comment.id, resolution: `no change — ${note}` });
      edits.push({ commentId: comment.id, before: beforeText, after: afterText, changed: false, reason: "no-change", note });
      // Leave newHtml untouched for this span; do not add to allowed (nothing moved).
      continue;
    }
    newHtml = slice.before + replacement + slice.after;
    perComment.push({ commentId: comment.id, resolution: reason === "override" ? `replaced span with reviewer-supplied text "${truncate(span.quote, 50)}"` : `applied to span "${truncate(span.quote, 60)}"` });
    edits.push({ commentId: comment.id, before: beforeText, after: afterText, changed: true, reason, note: reason === "override" ? "reviewer override (literal replacement)" : undefined });
    allowed.push({ start: span.start, end: span.end });
  }

  const { surgical, untouchedSectionsChanged } = verifySurgical(html, newHtml, allowed);
  const changed = edits.filter((e) => e.changed).length;
  return { newHtml, perComment, surgical, untouchedSectionsChanged, edits, changed };
}

// ── Independent verifier ─────────────────────────────────────────────────────
// Re-derive what changed by diffing the rendered text, then confirm every change
// sits inside a commented span. Does not consult the splice plan beyond the
// allowed ranges (which are just the comment anchors).

interface Token {
  value: string;
  start: number;
  end: number;
}

function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  const re = /\w+|\s+|[^\w\s]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) tokens.push({ value: m[0], start: m.index, end: m.index + m[0].length });
  return tokens;
}

type Op = { kind: "equal" | "delete" | "insert"; oldStart: number; oldEnd: number };

// Classic LCS diff over tokens; we only need each change's position in the OLD text.
function diff(oldTokens: Token[], newTokens: Token[]): Op[] {
  const n = oldTokens.length;
  const m = newTokens.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i][j] = oldTokens[i].value === newTokens[j].value ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);

  const ops: Op[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (oldTokens[i].value === newTokens[j].value) {
      ops.push({ kind: "equal", oldStart: oldTokens[i].start, oldEnd: oldTokens[i].end });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push({ kind: "delete", oldStart: oldTokens[i].start, oldEnd: oldTokens[i].end });
      i++;
    } else {
      const at = i < n ? oldTokens[i].start : tokensEnd(oldTokens);
      ops.push({ kind: "insert", oldStart: at, oldEnd: at });
      j++;
    }
  }
  while (i < n) {
    ops.push({ kind: "delete", oldStart: oldTokens[i].start, oldEnd: oldTokens[i].end });
    i++;
  }
  const tail = i < n ? oldTokens[i].start : tokensEnd(oldTokens);
  while (j < m) {
    ops.push({ kind: "insert", oldStart: tail, oldEnd: tail });
    j++;
  }
  return ops;
}

function tokensEnd(tokens: Token[]): number {
  return tokens.length ? tokens[tokens.length - 1].end : 0;
}

export function verifySurgical(
  oldHtml: string,
  newHtml: string,
  allowed: { start: number; end: number }[],
): { surgical: boolean; untouchedSectionsChanged: string[] } {
  const oldText = htmlToText(oldHtml).text;
  const newText = htmlToText(newHtml).text;
  if (oldText === newText) return { surgical: true, untouchedSectionsChanged: [] };

  const ops = diff(tokenize(oldText), tokenize(newText));
  // Pad allowed ranges by one char so an edit touching the span's first/last
  // word still counts as inside it.
  const ranges = allowed.map((r) => ({ start: r.start - 1, end: r.end + 1 }));
  const covered = (lo: number, hi: number) => ranges.some((r) => lo >= r.start && hi <= r.end);
  const point = (x: number) => ranges.some((r) => x >= r.start && x <= r.end);

  const offenders: { start: number; end: number }[] = [];
  for (const op of ops) {
    if (op.kind === "equal") continue;
    const ok = op.kind === "delete" ? covered(op.oldStart, op.oldEnd) : point(op.oldStart);
    if (!ok) offenders.push({ start: op.oldStart, end: Math.max(op.oldEnd, op.oldStart + 1) });
  }

  // Merge adjacent offenders, then widen each to whole words so the quote reads
  // sensibly (a zero-width insertion point alone would quote a single letter).
  const merged: { start: number; end: number }[] = [];
  for (const o of offenders.sort((a, b) => a.start - b.start)) {
    const last = merged[merged.length - 1];
    if (last && o.start <= last.end + 8) last.end = Math.max(last.end, o.end);
    else merged.push({ ...o });
  }
  const untouchedSectionsChanged = merged.map((o) => {
    let s = o.start;
    let e = Math.max(o.end, o.start + 1);
    while (s > 0 && /\S/.test(oldText[s - 1])) s--;
    while (e < oldText.length && /\S/.test(oldText[e])) e++;
    return truncate(oldText.slice(s, e).trim() || "(whitespace/structure)", 80);
  });
  return { surgical: untouchedSectionsChanged.length === 0, untouchedSectionsChanged };
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

// Move leading/trailing HTML tags out of `target` into `before`/`after`, so the
// span editor only ever sees the human-readable inner content and can never drop
// a structural tag. Operates on the raw HTML slice; text content is untouched.
function peelBoundaryTags(slice: HtmlSlice): HtmlSlice {
  let { before, target, after } = slice;
  const lead = /^(?:\s*<[^>]+>\s*)+/.exec(target);
  if (lead) {
    before += lead[0];
    target = target.slice(lead[0].length);
  }
  const trail = /(?:\s*<[^>]+>\s*)+$/.exec(target);
  if (trail) {
    after = trail[0] + after;
    target = target.slice(0, target.length - trail[0].length);
  }
  return { before, target, after };
}
