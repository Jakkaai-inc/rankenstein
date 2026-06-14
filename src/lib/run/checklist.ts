// Derived qualification checklist.
//
// "The system derives + displays the qualification checklist a piece must pass
//  to become a publish candidate" — Rankenstein's own per-run quality goal, the
// rubric the engine hillclimbs (the product analogue of /goal).
//
// This is DERIVED, never baked: the criteria are computed from the run config
// (layer toggles, depth, groundedness, content type) + the brand profile, so the
// list mirrors what the engine actually enforces for THIS run. The sources of
// truth are the engine layers — keep these in sync with:
//   - gates.ts        (mechanical gates, always required)
//   - aeo.ts          (AEO structure, when layers.aeo)
//   - verify.ts       (independent grounding verifier)
//   - guardrails.ts   (trademark / regulated / provenance flags)
//   - citation-verify.ts (article citations, when layers.citationVerify)
//   - pipeline.ts     (depthToWindow / articleDepthToWindow word windows)

import type { ContentType, Goal, QualityKnobs, LayerToggles } from "@/types/contracts";

export type ChecklistTier = "required" | "advisory";
export type ChecklistSource =
  | "gate"
  | "aeo"
  | "grounding"
  | "citation"
  | "brand"
  | "budget";

export interface ChecklistItem {
  id: string;
  label: string;
  /** human-readable requirement, parameterized by the config. */
  requirement: string;
  tier: ChecklistTier;
  source: ChecklistSource;
}

export interface ChecklistGroup {
  key: string;
  title: string;
  blurb: string;
  items: ChecklistItem[];
}

export interface DerivedChecklist {
  groups: ChecklistGroup[];
  summary: { required: number; advisory: number };
}

/** Config shape the derivation needs (decoupled from the DB Json columns). */
export interface ChecklistConfig {
  contentType: ContentType;
  goal: Goal;
  depth: "brief" | "standard" | "deep";
  readability: "simple" | "standard" | "technical";
  groundedness: "strict" | "balanced";
  quality: QualityKnobs;
  layers: LayerToggles;
  perPieceTokenCeiling: number;
  runSpendSoftStopUsd: number;
}

export interface ChecklistBrand {
  bannedWordCount: number;
  trademarkCount: number;
}

/** Mirrors pipeline.ts depthToWindow / articleDepthToWindow. */
function wordWindow(contentType: ContentType, depth: ChecklistConfig["depth"]): { min: number; max: number } {
  if (contentType === "article") {
    if (depth === "brief") return { min: 200, max: 1200 };
    if (depth === "deep") return { min: 500, max: 2600 };
    return { min: 250, max: 1800 };
  }
  if (depth === "brief") return { min: 180, max: 320 };
  if (depth === "deep") return { min: 400, max: 700 };
  return { min: 250, max: 500 };
}

export function deriveChecklist(config: ChecklistConfig, brand: ChecklistBrand): DerivedChecklist {
  const isProduct = config.contentType === "product";
  const win = wordWindow(config.contentType, config.depth);
  const groups: ChecklistGroup[] = [];

  // ── Mechanical gates — always required (gates.ts) ─────────────────────────
  const gateItems: ChecklistItem[] = [
    {
      id: "em-dash",
      label: "Zero em dashes",
      requirement: "No U+2014 em dashes anywhere — body, meta fields, or JSON-LD.",
      tier: "required",
      source: "gate",
    },
    {
      id: "h1-count",
      label: "Exactly one H1",
      requirement: "The piece has a single <h1> heading.",
      tier: "required",
      source: "gate",
    },
    {
      id: "emoji-heading",
      label: "No emoji in headings",
      requirement: "Headings contain no emoji.",
      tier: "required",
      source: "gate",
    },
    {
      id: "word-count",
      label: "Body length in range",
      requirement: `Body word count between ${win.min} and ${win.max} (${config.depth} depth, ${config.contentType}).`,
      tier: "required",
      source: "gate",
    },
    {
      id: "slug-length",
      label: "Slug ≤ 5 words",
      requirement: "URL slug is non-empty and at most 5 words.",
      tier: "required",
      source: "gate",
    },
    {
      id: "meta-title",
      label: "Meta title length",
      requirement: "Meta title is between 30 and 62 characters.",
      tier: "required",
      source: "gate",
    },
    {
      id: "meta-desc",
      label: "Meta description length",
      requirement: "Meta description is at most 155 characters.",
      tier: "required",
      source: "gate",
    },
    {
      id: "jsonld",
      label: "Valid JSON-LD",
      requirement: "Structured data parses as an object with no fabricated ratings/reviews.",
      tier: "required",
      source: "gate",
    },
  ];
  if (brand.bannedWordCount > 0) {
    gateItems.push({
      id: "banned-words",
      label: "No banned brand words",
      requirement: `None of the ${brand.bannedWordCount} brand-forbidden term(s) appear in visible copy or meta.`,
      tier: "required",
      source: "brand",
    });
  }
  groups.push({
    key: "gates",
    title: "Mechanical gates",
    blurb: "Deterministic checks applied to every piece. One auto-repair round (em dashes); anything still failing blocks publish.",
    items: gateItems,
  });

  // ── AEO structure — only when the AEO layer is on (aeo.ts) ─────────────────
  if (config.layers.aeo) {
    const aeoItems: ChecklistItem[] = [
      {
        id: "three-sentence",
        label: "Three-sentence lead",
        requirement: "Opening paragraph answers who / what / how-different in ≥3 sentences and names the topic.",
        tier: "required",
        source: "aeo",
      },
      {
        id: "faq",
        label: "FAQ present",
        requirement: "An FAQ section with real buyer questions is included.",
        tier: "required",
        source: "aeo",
      },
    ];
    if (isProduct) {
      aeoItems.push({
        id: "spec-table",
        label: "Extractable spec table",
        requirement: "Product rewrite includes a machine-extractable spec table.",
        tier: "required",
        source: "aeo",
      });
    }
    aeoItems.push({
      id: "differentiation",
      label: "Concrete differentiation",
      requirement: isProduct
        ? "Copy states ≥1 concrete number/spec that traces to an internal product fact."
        : "Copy states ≥1 concrete number/spec that is grounded in a fact or backed by an inline citation.",
      tier: "required",
      source: "aeo",
    });
    aeoItems.push({
      id: "extractability",
      label: "Key facts in body",
      requirement: "Material facts appear in body text, not only in meta/alt attributes.",
      tier: "advisory",
      source: "aeo",
    });
    aeoItems.push({
      id: "one-paragraph",
      label: "One-paragraph summarizable",
      requirement: "An LLM could summarize the piece accurately in a single paragraph.",
      tier: "advisory",
      source: "aeo",
    });
    groups.push({
      key: "aeo",
      title: "Answer-engine structure",
      blurb: "Structure checks so answer engines can extract and cite the piece. Required items block; advisory items are surfaced, not enforced.",
      items: aeoItems,
    });
  }

  // ── Grounding & provenance — always (verify.ts + guardrails.ts) ────────────
  const strict = config.groundedness === "strict";
  const groundingItems: ChecklistItem[] = [
    {
      id: "claims-traced",
      label: "Every claim traces to a source",
      requirement: strict
        ? "An independent verifier (fresh context) confirms every material claim traces to a T1/T2 source fact. Ungrounded claims block. A self-check never satisfies this."
        : "An independent verifier confirms material claims trace to a source fact; incidental phrasing is tolerated. A self-check never satisfies this.",
      tier: "required",
      source: "grounding",
    },
    {
      id: "no-fabrication",
      label: "No fabricated specs",
      requirement: "Missing data is flagged as a gap, never guessed (no invented dimensions, ratings, or availability).",
      tier: "required",
      source: "grounding",
    },
    {
      id: "regulated",
      label: "No unsupported regulated claims",
      requirement: "Health/safety/legal-style claims are not asserted without grounding.",
      tier: "required",
      source: "grounding",
    },
  ];
  if (brand.trademarkCount > 0) {
    groundingItems.push({
      id: "trademark",
      label: "Trademark usage clean",
      requirement: `The ${brand.trademarkCount} tracked trademark(s) are used correctly (no misappropriation or improper ®/™ use).`,
      tier: "required",
      source: "grounding",
    });
  }
  groups.push({
    key: "grounding",
    title: "Grounding & provenance",
    blurb: `Groundedness: ${config.groundedness}. The verifier runs in a fresh context, independent of the writer.`,
    items: groundingItems,
  });

  // ── Citations — articles with the citation-verify layer (citation-verify.ts)
  if (config.contentType === "article" && config.layers.citationVerify) {
    groups.push({
      key: "citation",
      title: "Citation verification",
      blurb: "Each cited claim is checked by an independent agent before the piece can publish.",
      items: [
        {
          id: "cite-loads",
          label: "Sources load",
          requirement: "Every cited URL resolves (the source page is reachable).",
          tier: "required",
          source: "citation",
        },
        {
          id: "cite-supports",
          label: "Sources support the claim",
          requirement: "Each citation actually supports the specific claim it is attached to.",
          tier: "required",
          source: "citation",
        },
        {
          id: "cite-authority",
          label: "Authority for sensitive topics",
          requirement: "Health / finance / legal claims cite a high-authority source.",
          tier: "required",
          source: "citation",
        },
      ],
    });
  }

  // ── Run budget — operational guardrails (advisory) ─────────────────────────
  groups.push({
    key: "budget",
    title: "Run budget",
    blurb: "Operational ceilings that bound a run; pieces that would exceed them are halted rather than published over budget.",
    items: [
      {
        id: "token-ceiling",
        label: "Per-piece token ceiling",
        requirement: `Each piece may use at most ${config.perPieceTokenCeiling.toLocaleString()} tokens.`,
        tier: "advisory",
        source: "budget",
      },
      {
        id: "spend-stop",
        label: "Run spend soft-stop",
        requirement: `The run soft-stops once estimated spend reaches $${config.runSpendSoftStopUsd}.`,
        tier: "advisory",
        source: "budget",
      },
    ],
  });

  const all = groups.flatMap((g) => g.items);
  return {
    groups,
    summary: {
      required: all.filter((i) => i.tier === "required").length,
      advisory: all.filter((i) => i.tier === "advisory").length,
    },
  };
}
