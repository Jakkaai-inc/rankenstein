import { describe, expect, it } from "vitest";

import { detectVolatileFlags, detectVolatileMatches } from "../volatile";

describe("detectVolatileMatches — availability", () => {
  it("flags 'N of N variants in stock' baked into a spec row", () => {
    const html = `<table><tr><td>Availability</td><td>20 of 20 variants in stock</td></tr></table>`;
    const m = detectVolatileMatches(html);
    expect(m).toHaveLength(1);
    expect(m[0].kind).toBe("availability");
    expect(m[0].quote).toContain("20 of 20 variants in stock");
  });

  it("flags the '20/20' slash form too", () => {
    const m = detectVolatileMatches(`<p>20/20 variants in stock</p>`);
    expect(m.some((x) => x.kind === "availability")).toBe(true);
  });

  it("flags in stock / out of stock / sold out / only N left", () => {
    for (const phrase of ["In stock", "Out of stock", "Sold out", "Only 3 left"]) {
      const m = detectVolatileMatches(`<p>${phrase}</p>`);
      expect(m.some((x) => x.kind === "availability")).toBe(true);
    }
  });

  it("does not flag ordinary grounded copy with no volatile field", () => {
    const html = `<p>This is a 100% polyester minky in nine neutral shades, 58/60 inches wide.</p>`;
    expect(detectVolatileMatches(html)).toHaveLength(0);
  });
});

describe("detectVolatileMatches — price in prose", () => {
  it("flags a concrete price restated in a sentence", () => {
    const html = `<p>You can buy Per Yard at $20.00, by the Bolt at $150.00, or full Roll at $450.00 USD.</p>`;
    const m = detectVolatileMatches(html);
    expect(m.some((x) => x.kind === "price")).toBe(true);
  });

  it("does NOT flag a price in a short spec-table cell (range is fine there)", () => {
    const html = `<table><tr><td>Price range</td><td>$20.00 - $450.00 USD</td></tr></table>`;
    const m = detectVolatileMatches(html);
    expect(m.some((x) => x.kind === "price")).toBe(false);
  });

  it("can be turned off via priceInProse:false", () => {
    const html = `<p>You can buy Per Yard at $20.00, by the Bolt at $150.00, or full Roll at $450.00 USD.</p>`;
    const m = detectVolatileMatches(html, { priceInProse: false });
    expect(m.some((x) => x.kind === "price")).toBe(false);
  });
});

describe("detectVolatileFlags — severities", () => {
  it("availability is BAD, price-in-prose is WARN", () => {
    const html = `<table><tr><td>Availability</td><td>20 of 20 variants in stock</td></tr></table>
      <p>You can buy Per Yard at $20.00 and scale up to a full Roll at $450.00 USD when you are ready.</p>`;
    const flags = detectVolatileFlags(html);
    const avail = flags.find((f) => f.note.includes("variants in stock"));
    const price = flags.find((f) => f.note.toLowerCase().includes("price"));
    expect(avail?.severity).toBe("BAD");
    expect(price?.severity).toBe("WARN");
  });

  it("matches the real EZ Fabric piece shape that triggered this (availability row + priced FAQ)", () => {
    const html = `
      <h2>Specs</h2>
      <table>
        <tr><td>Price range</td><td>$20.00 - $450.00 USD</td></tr>
        <tr><td>Availability</td><td>20 of 20 variants in stock</td></tr>
      </table>
      <h2>FAQ</h2>
      <p>You can buy Per Yard at $20.00, by the Bolt at $150.00, Half Roll at $237.50, or full Roll at $450.00 USD. This makes it easy to sample first.</p>`;
    const flags = detectVolatileFlags(html);
    // exactly one availability BAD flag
    expect(flags.filter((f) => f.severity === "BAD" && f.note.includes("variants in stock"))).toHaveLength(1);
    // the priced FAQ sentence is WARN; the spec-table price row is NOT flagged
    expect(flags.some((f) => f.severity === "WARN")).toBe(true);
  });
});
