// Live provider implementations of Lane C's engine interfaces, backed by the
// Anthropic Messages API (src/lib/llm.ts). Deployable: no subprocess, no agent
// binary. A fresh llm call per verify = the independent context the rubric wants.
//
// Lives in Lane A (src/lib/run) to avoid colliding with Lane C's src/lib/engine.

import { llmJson, llmText } from "@/lib/llm";
import type {
  ResearchProvider,
  SerpProvider,
  Rewriter,
  Verifier,
  RewriteInput,
} from "@/lib/engine";
import type {
  KeywordCandidate,
  SerpOwnership,
  SiteAuthority,
  PieceDraft,
  EngineVerdict,
  FactRows,
} from "@/lib/engine/types";

// ── Research: model proposes raw candidates, tagged web-estimate (no fabricated numbers) ──
export class LlmResearchProvider implements ResearchProvider {
  async keywords(seedTerms: string[], country: string): Promise<KeywordCandidate[]> {
    const out = await llmJson<{ keywords: { keyword: string; intent: string; parentTopic?: string }[] }>(
      `Seed topics: ${seedTerms.join(", ")}. Country: ${country}.\nPropose 18-25 RAW keyword candidates a shopper would search, mixing product-defining and variant (color/size/material) terms. Do NOT self-filter. Do NOT invent search volumes.\nReturn JSON: {"keywords":[{"keyword":string,"intent":"informational"|"commercial"|"transactional"|"local"|"navigational","parentTopic":string}]}`,
      { tier: "fast", system: "You are a keyword researcher. Never fabricate metrics.", maxTokens: 2000 },
    );
    return (out.keywords ?? []).map((k) => ({
      keyword: k.keyword,
      volume: null,
      kd: null,
      intent: (["informational", "commercial", "transactional", "local", "navigational"].includes(k.intent)
        ? k.intent
        : "commercial") as KeywordCandidate["intent"],
      parentTopic: k.parentTopic,
      source: "web-estimate" as const,
    }));
  }
}

// ── SERP ownership: model estimates owners + winnability given site authority ──
export class LlmSerpProvider implements SerpProvider {
  async ownership(candidates: KeywordCandidate[], siteAuthority: SiteAuthority): Promise<SerpOwnership[]> {
    if (candidates.length === 0) return [];
    const dr = siteAuthority.dr ?? "unknown (treat as low)";
    const out = await llmJson<{ verdicts: { keyword: string; owners: string[]; winnable: string }[] }>(
      `For a store with domain rating ${dr}, estimate the top-of-SERP competition for these keywords and whether this store can realistically rank. Keywords:\n${candidates.map((c) => c.keyword).join("\n")}\n\nReturn JSON: {"verdicts":[{"keyword":string,"owners":[string up to 3 likely dominant site types/domains],"winnable":"yes"|"no"|"stretch"}]}. This is a web-estimate; be conservative.`,
      { tier: "fast", system: "You are a SERP analyst making conservative web estimates.", maxTokens: 2000 },
    );
    const byKw = new Map(out.verdicts?.map((v) => [v.keyword.toLowerCase(), v]) ?? []);
    return candidates.map((c) => {
      const v = byKw.get(c.keyword.toLowerCase());
      return {
        keyword: c.keyword,
        topUrls: [],
        avgDR: null,
        owners: v?.owners ?? [],
        winnable: (["yes", "no", "stretch"].includes(v?.winnable ?? "") ? v!.winnable : "stretch") as SerpOwnership["winnable"],
      };
    });
  }
}

// ── Rewriter: strong-tier, grounded ONLY in the FactsTable ──────────────────
export class LlmRewriter implements Rewriter {
  readonly id = "llm-strong";

  async rewrite(input: RewriteInput): Promise<PieceDraft> {
    const factsText = input.facts
      .map((f) => `- ${f.field}: ${f.value}  [${f.trust}] (source: ${f.source})`)
      .join("\n");
    const primary = input.selection.primary.candidate.keyword;
    const secondaries = input.selection.secondaries.map((s) => s.candidate.keyword).join(", ");

    const system = `You write publish-ready Shopify product descriptions. HARD RULES:
- Ground EVERY factual claim in the FACTS table below. Never state a spec, material, dimension, certification, or number not present in FACTS. T3 (unverified) facts may NOT be asserted.
- No em dashes anywhere. No emojis in headings. Banned words: ${input.brandVoiceNote || "(none)"}.
- AEO structure: a lead passing the 3-sentence test (who it is for / what problem / how different), a "who it's for" section, an extractable spec table built only from FACTS, and an FAQ (2-4 sentence answers).
- Honest peer tone, never hard-sell. Output ONLY a JSON object.`;

    const draft = await llmJson<{ html: string; title: string; description: string; slug: string; jsonld: Record<string, unknown> }>(
      `FACTS (the only permissible claim sources):\n${factsText}\n\nVendor: ${input.vendorName}\nPrimary keyword: ${primary}\nSecondary keywords: ${secondaries}\nStore currency: ${input.store.currency ?? "unknown"}\nBody word target: ${input.wordTarget.min}-${input.wordTarget.max} words.\n\nReturn JSON: {"html": "<body HTML: one <h1>, lead, who-it's-for, spec <table> from FACTS, FAQ>", "title": "meta title 50-60 chars, primary keyword near front", "description": "meta description <=155 chars", "slug": "<=5 hyphenated words", "jsonld": { Product schema object using ONLY facts; priceCurrency from store currency; NO aggregateRating unless review facts exist }}`,
      { tier: "strong", system, maxTokens: 4000 },
    );

    return {
      html: draft.html,
      meta: { title: draft.title, description: draft.description, slug: draft.slug },
      jsonld: draft.jsonld ?? {},
      variantMap: input.selection.variantMap,
      rewriterId: this.id,
    };
  }
}

// ── Verifier: INDEPENDENT context, grades claims against facts ──────────────
export class LlmVerifier implements Verifier {
  readonly mode = "independent" as const;

  async verify(piece: PieceDraft, facts: FactRows): Promise<EngineVerdict> {
    const factsText = facts.map((f) => `- ${f.field}: ${f.value} [${f.trust}]`).join("\n");
    const out = await llmJson<{
      verdict: "pass" | "fail";
      claims: { claim: string; source: string | null; grounded: boolean }[];
      gates: Record<string, { pass: boolean; note: string }>;
    }>(
      `You are an INDEPENDENT verifier. You did not write this. Grade the product description against the FACTS.\n\nFACTS:\n${factsText}\n\nDESCRIPTION HTML:\n${piece.html}\n\nMeta title: ${piece.meta.title}\nMeta description: ${piece.meta.description}\n\nExtract every factual claim. For each, mark grounded=true ONLY if it traces to a FACT (T1/T2). Any ungrounded asserted claim, fabricated spec/cert/number, em dash, emoji heading, or aggregateRating without review facts => FAIL.\nReturn JSON: {"verdict":"pass"|"fail","claims":[{"claim":string,"source":string|null,"grounded":boolean}],"gates":{"grounding":{"pass":bool,"note":str},"brandVoice":{"pass":bool,"note":str},"structuredData":{"pass":bool,"note":str}}}`,
      { tier: "fast", system: "You are a strict, independent fact-grounding verifier. Default to fail when uncertain.", maxTokens: 3000 },
    );
    return {
      verdict: out.verdict === "pass" ? "pass" : "fail",
      mode: "independent",
      perGate: out.gates ?? {},
      claimTrace: (out.claims ?? []).map((c) => ({
        claim: c.claim,
        source: c.source,
        trust: null,
        grounded: c.grounded,
      })),
    };
  }
}

export function liveDeps() {
  return {
    research: new LlmResearchProvider(),
    serp: new LlmSerpProvider(),
    rewriter: new LlmRewriter(),
    verifier: new LlmVerifier(),
  };
}

// Touch llmText so tree-shakers keep the import surface obvious.
export const _llmText = llmText;
