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
