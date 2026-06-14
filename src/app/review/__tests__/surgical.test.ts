import { describe, it, expect } from "vitest";

import { surgicalEditPiece, verifySurgical, type SpanEditFn } from "../surgical";
import { htmlToText } from "@/components/preview/anchor";
import type { FeedbackSet } from "@/types/contracts";

const HTML = "<h1>Spotted Dove Snuggle</h1>\n<p>It is a soft fabric for makers.</p>\n<p>Ten shades, four formats.</p>";

function spanAnchor(quote: string) {
  const text = htmlToText(HTML).text;
  const start = text.indexOf(quote);
  return { mode: "span" as const, textQuote: quote, startOffset: start, endOffset: start + quote.length };
}

describe("surgicalEditPiece", () => {
  it("rewrites only the commented span and verifies surgically", async () => {
    const edit: SpanEditFn = async ({ quote }) => quote.replace("soft", "plush, breathable");
    const feedback: FeedbackSet = {
      pieceId: "p1",
      version: 1,
      comments: [{ id: "c1", version: 1, anchor: spanAnchor("soft fabric"), body: "make it richer", modality: "text" }],
    };
    const r = await surgicalEditPiece(HTML, feedback, edit);
    expect(r.surgical).toBe(true);
    expect(r.untouchedSectionsChanged).toEqual([]);
    expect(r.newHtml).toContain("plush, breathable fabric");
    expect(r.newHtml).toContain("<h1>Spotted Dove Snuggle</h1>"); // heading untouched
    expect(r.newHtml).toContain("Ten shades, four formats."); // other para untouched
    expect(r.perComment[0].resolution).toMatch(/applied/);
  });

  it("flags a global comment as not a surgical span edit", async () => {
    const edit: SpanEditFn = async ({ quote }) => quote;
    const feedback: FeedbackSet = {
      pieceId: "p1",
      version: 1,
      comments: [{ id: "g1", version: 1, anchor: { mode: "global", selector: "field:metaTitle" }, body: "shorten title", modality: "text" }],
    };
    const r = await surgicalEditPiece(HTML, feedback, edit);
    expect(r.newHtml).toBe(HTML);
    expect(r.perComment[0].resolution).toMatch(/global/);
  });

  it("skips a comment whose quote no longer anchors", async () => {
    const edit: SpanEditFn = async ({ quote }) => quote;
    const feedback: FeedbackSet = {
      pieceId: "p1",
      version: 1,
      comments: [{ id: "x1", version: 1, anchor: { mode: "span", textQuote: "GSM polyester rating" }, body: "fix", modality: "text" }],
    };
    const r = await surgicalEditPiece(HTML, feedback, edit);
    expect(r.perComment[0].resolution).toMatch(/could not re-anchor/);
    expect(r.newHtml).toBe(HTML);
  });

  it("reports a NO-OP honestly when the editor returns the span unchanged", async () => {
    // Editor echoes the span back (the real-world failure: a removal request the
    // model declined to act on). Must NOT be counted as a change.
    const edit: SpanEditFn = async ({ targetHtml }) => targetHtml;
    const feedback: FeedbackSet = {
      pieceId: "p1",
      version: 1,
      comments: [{ id: "c1", version: 1, anchor: spanAnchor("soft fabric"), body: "remove this", modality: "text" }],
    };
    const r = await surgicalEditPiece(HTML, feedback, edit);
    expect(r.changed).toBe(0);
    expect(r.newHtml).toBe(HTML); // nothing written
    expect(r.edits[0].changed).toBe(false);
    expect(r.perComment[0].resolution).toMatch(/no change/i);
  });

  it("supports DELETION (editor returns empty for a removal) and records before/after", async () => {
    const edit: SpanEditFn = async () => ""; // delete the span
    const feedback: FeedbackSet = {
      pieceId: "p1",
      version: 1,
      comments: [{ id: "c1", version: 1, anchor: spanAnchor("soft fabric"), body: "delete this", modality: "text" }],
    };
    const r = await surgicalEditPiece(HTML, feedback, edit);
    expect(r.changed).toBe(1);
    expect(r.newHtml).not.toContain("soft fabric");
    expect(r.newHtml).toContain("<h1>Spotted Dove Snuggle</h1>"); // heading untouched
    expect(r.edits[0]).toMatchObject({ before: "soft fabric", after: "", changed: true });
    expect(r.surgical).toBe(true);
  });

  it("records before/after on a real rewrite", async () => {
    const edit: SpanEditFn = async ({ quote }) => quote.replace("soft", "plush");
    const feedback: FeedbackSet = {
      pieceId: "p1",
      version: 1,
      comments: [{ id: "c1", version: 1, anchor: spanAnchor("soft fabric"), body: "richer", modality: "text" }],
    };
    const r = await surgicalEditPiece(HTML, feedback, edit);
    expect(r.changed).toBe(1);
    expect(r.edits[0].before).toBe("soft fabric");
    expect(r.edits[0].after).toBe("plush fabric");
    expect(r.edits[0].reason).toBe("applied");
  });

  it("reports each comment's fate: one applied, one no-op (the 2-comment case)", async () => {
    // c1 changes; c2 is a refusal (editor echoes the span back).
    const edit: SpanEditFn = async ({ quote }) =>
      quote.includes("soft") ? quote.replace("soft", "plush") : quote;
    const feedback: FeedbackSet = {
      pieceId: "p1",
      version: 1,
      comments: [
        { id: "c1", version: 1, anchor: spanAnchor("soft fabric"), body: "richer", modality: "text" },
        { id: "c2", version: 1, anchor: spanAnchor("Ten shades, four formats."), body: "website says no ironing", modality: "text" },
      ],
    };
    const r = await surgicalEditPiece(HTML, feedback, edit);
    const byId = Object.fromEntries(r.edits.map((e) => [e.commentId, e]));
    expect(byId.c1.reason).toBe("applied");
    expect(byId.c1.changed).toBe(true);
    expect(byId.c2.reason).toBe("no-change");
    expect(byId.c2.changed).toBe(false);
    expect(byId.c2.note).toMatch(/refus|not in the grounded source|replace with/i);
    expect(r.changed).toBe(1); // only one actually moved
  });

  it("preserves a trailing structural tag when the span ends at the last text char", async () => {
    // "Ten shades, four formats." is the final text; its slice swallows "</p>".
    // A real rewrite must NOT drop that closing tag.
    const edit: SpanEditFn = async () => "Nine shades, three formats.";
    const feedback: FeedbackSet = {
      pieceId: "p1",
      version: 1,
      comments: [{ id: "c1", version: 1, anchor: spanAnchor("Ten shades, four formats."), body: "update counts", modality: "text" }],
    };
    const r = await surgicalEditPiece(HTML, feedback, edit);
    expect(r.changed).toBe(1);
    expect(r.newHtml).toContain("Nine shades, three formats.</p>"); // tag kept
    expect(r.newHtml).not.toContain("Ten shades");
  });

  it("HUMAN OVERRIDE: 'replace with: <text>' bypasses the AI and splices literally", async () => {
    // The AI editor would no-op (echo), proving the override path does not call it.
    const edit: SpanEditFn = async ({ targetHtml }) => targetHtml;
    const feedback: FeedbackSet = {
      pieceId: "p1",
      version: 1,
      comments: [{ id: "c1", version: 1, anchor: spanAnchor("soft fabric"), body: "replace with: do-not-iron fabric", modality: "text" }],
    };
    const r = await surgicalEditPiece(HTML, feedback, edit);
    expect(r.changed).toBe(1);
    expect(r.edits[0].reason).toBe("override");
    expect(r.edits[0].after).toBe("do-not-iron fabric");
    expect(r.newHtml).toContain("do-not-iron fabric");
    expect(r.surgical).toBe(true); // still proven surgical
  });
});

describe("verifySurgical (independent of the splicer)", () => {
  it("passes when every change sits inside an allowed span", () => {
    const oldText = htmlToText(HTML).text;
    const start = oldText.indexOf("soft fabric");
    const newHtml = HTML.replace("soft fabric", "plush, breathable fabric");
    const r = verifySurgical(HTML, newHtml, [{ start, end: start + "soft fabric".length }]);
    expect(r.surgical).toBe(true);
  });

  it("catches a change OUTSIDE the commented spans", () => {
    // Edit the heading but only allow the body span -> must be caught.
    const oldText = htmlToText(HTML).text;
    const start = oldText.indexOf("soft fabric");
    const tampered = HTML.replace("Spotted Dove Snuggle", "Spotted Dove DELUXE Snuggle").replace("soft fabric", "plush fabric");
    const r = verifySurgical(HTML, tampered, [{ start, end: start + "soft fabric".length }]);
    expect(r.surgical).toBe(false);
    expect(r.untouchedSectionsChanged.join(" ")).toMatch(/Spotted Dove|Snuggle/);
  });
});
