import { describe, it, expect } from "vitest";

import { htmlToText, sliceByText, resolveAnchor } from "../anchor";

describe("htmlToText", () => {
  it("strips tags, decodes entities, keeps inter-tag whitespace like textContent", () => {
    const html = "<h1>Soft &amp; Plush</h1>\n<p>Ten shades.</p>";
    const { text, map } = htmlToText(html);
    expect(text).toBe("Soft & Plush\nTen shades.");
    // map round-trips: the html offset of a text char points back at the right byte.
    expect(html[map[0]]).toBe("S"); // start of "Soft"
    expect(map[text.length]).toBe(html.length);
  });

  it("drops script/style bodies", () => {
    const html = "<p>a</p><style>.x{color:red}</style><script>var y=1</script><p>b</p>";
    expect(htmlToText(html).text).toBe("ab");
  });

  it("maps an entity char to the entity's start so slicing stays exact", () => {
    const html = "<p>A &amp; B</p>";
    const { text, map } = htmlToText(html);
    const amp = text.indexOf("&");
    // The decoded '&' begins at the literal '&amp;' in the source.
    expect(html.slice(map[amp], map[amp] + 5)).toBe("&amp;");
  });
});

describe("sliceByText", () => {
  it("slices the html for a plain-text range, leaving before/after byte-identical", () => {
    const html = "<p>The quick brown fox.</p>";
    const { text } = htmlToText(html);
    const start = text.indexOf("quick");
    const end = start + "quick brown".length;
    const { before, target, after } = sliceByText(html, start, end);
    expect(target).toBe("quick brown");
    expect(before + target + after).toBe(html);
  });

  it("includes inline tags when the span crosses them", () => {
    const html = "<p>buy <b>per yard</b> today</p>";
    const { text } = htmlToText(html); // "buy per yard today"
    const start = text.indexOf("per");
    const end = text.indexOf("today");
    const { target } = sliceByText(html, start, end);
    expect(target).toBe("per yard</b> ");
  });
});

describe("resolveAnchor", () => {
  const text = "Ten shades and four buying formats from one design.";

  it("trusts valid offsets", () => {
    const at = text.indexOf("four buying formats");
    const r = resolveAnchor(text, { mode: "span", textQuote: "four buying formats", startOffset: at, endOffset: at + 19 });
    expect(r).toEqual({ start: at, end: at + 19, quote: "four buying formats" });
  });

  it("relocates by quote when offsets drift", () => {
    const r = resolveAnchor(text, { mode: "span", textQuote: "four buying formats", startOffset: 999, endOffset: 1018 });
    expect(r?.start).toBe(text.indexOf("four buying formats"));
  });

  it("returns null for a lost quote and for global anchors", () => {
    expect(resolveAnchor(text, { mode: "span", textQuote: "polyester GSM rating" })).toBeNull();
    expect(resolveAnchor(text, { mode: "global", selector: "field:metaTitle" })).toBeNull();
  });

  it("disambiguates duplicate quotes by nearest original offset", () => {
    const dup = "soft fabric. very soft fabric.";
    const r = resolveAnchor(dup, { mode: "span", textQuote: "soft fabric", startOffset: 18, endOffset: 29 });
    expect(r?.start).toBe(18); // the second occurrence, not the first
  });
});
