import { describe, expect, it } from "vitest";

import { deriveChecklist, type ChecklistConfig, type ChecklistBrand } from "./checklist";

const baseConfig: ChecklistConfig = {
  contentType: "product",
  goal: "improve_product",
  depth: "standard",
  readability: "standard",
  groundedness: "strict",
  quality: { tables: true, quotes: false, kpiChips: false, charts: false, images: false },
  layers: { angle: false, aeo: true, citationVerify: false, imageGen: false },
  perPieceTokenCeiling: 60000,
  runSpendSoftStopUsd: 5,
};

const brand: ChecklistBrand = { bannedWordCount: 3, trademarkCount: 1 };

function ids(c: ReturnType<typeof deriveChecklist>): string[] {
  return c.groups.flatMap((g) => g.items.map((i) => i.id));
}

describe("deriveChecklist", () => {
  it("always includes mechanical gates and grounding", () => {
    const c = deriveChecklist(baseConfig, brand);
    expect(ids(c)).toEqual(expect.arrayContaining(["em-dash", "h1-count", "jsonld", "claims-traced", "no-fabrication"]));
  });

  it("drops AEO criteria when the AEO layer is off", () => {
    const off = deriveChecklist({ ...baseConfig, layers: { ...baseConfig.layers, aeo: false } }, brand);
    expect(ids(off)).not.toContain("three-sentence");
    expect(ids(off)).not.toContain("spec-table");
    expect(ids(off)).not.toContain("faq");
  });

  it("includes the spec table for products but not for articles", () => {
    const product = deriveChecklist({ ...baseConfig, contentType: "product" }, brand);
    expect(ids(product)).toContain("spec-table");
    const article = deriveChecklist({ ...baseConfig, contentType: "article" }, brand);
    expect(ids(article)).not.toContain("spec-table");
  });

  it("adds citation criteria only for articles with the citation-verify layer", () => {
    const article = deriveChecklist(
      { ...baseConfig, contentType: "article", layers: { ...baseConfig.layers, citationVerify: true } },
      brand,
    );
    expect(ids(article)).toEqual(expect.arrayContaining(["cite-loads", "cite-supports", "cite-authority"]));
    const product = deriveChecklist({ ...baseConfig, layers: { ...baseConfig.layers, citationVerify: true } }, brand);
    expect(ids(product)).not.toContain("cite-loads");
  });

  it("reflects depth in the word-count requirement", () => {
    const deep = deriveChecklist({ ...baseConfig, depth: "deep" }, brand);
    const wc = deep.groups.flatMap((g) => g.items).find((i) => i.id === "word-count");
    expect(wc?.requirement).toContain("400");
    expect(wc?.requirement).toContain("700");
  });

  it("changes the grounding wording between strict and balanced", () => {
    const strict = deriveChecklist({ ...baseConfig, groundedness: "strict" }, brand);
    const balanced = deriveChecklist({ ...baseConfig, groundedness: "balanced" }, brand);
    const claim = (c: ReturnType<typeof deriveChecklist>) =>
      c.groups.flatMap((g) => g.items).find((i) => i.id === "claims-traced")?.requirement ?? "";
    expect(claim(strict)).toContain("T1/T2");
    expect(claim(strict)).not.toEqual(claim(balanced));
  });

  it("omits banned-word and trademark items when the brand has none", () => {
    const c = deriveChecklist(baseConfig, { bannedWordCount: 0, trademarkCount: 0 });
    expect(ids(c)).not.toContain("banned-words");
    expect(ids(c)).not.toContain("trademark");
  });

  it("counts required vs advisory", () => {
    const c = deriveChecklist(baseConfig, brand);
    expect(c.summary.required).toBeGreaterThan(0);
    expect(c.summary.advisory).toBeGreaterThan(0);
    const total = c.groups.flatMap((g) => g.items).length;
    expect(c.summary.required + c.summary.advisory).toBe(total);
  });
});
