# Rankenstein — Layer Contracts (typed pipeline stages)

> Each layer is one stage in a per-piece workflow. **Deterministic layers are plain code** (no model). **Agent layers** get ONE goal, a typed output schema (validated; retry on mismatch), and a model tier. UI toggles map 1:1 to optional layers. A piece is one pure workflow run; shared state (registry, history, brand profile) is read from the DB at start and committed only on publish.
>
> Creativity bounds: agent layers may vary tone/structure within their output schema based on content type, industry, and competitor depth — they may never relax a blocking gate.

## Conventions

```
LAYER <id> (<agent|code>, <required|toggle>)
  IN:   <inputs>
  OUT:  <typed output>
  PASS: <criteria — failing output never reaches the next layer>
```

## Shared layers

```
LAYER ground (code+fetch, required)
  IN:   piece target (product id | article topic), catalog snapshot / live product, brand profile (CONFIRMED only),
        store context { currency, locale, primary domain } from shop settings
  OUT:  FactsTable { field, value, source, trust }[] — the only permissible claim sources
  PASS: brand profile confirmed (HARD STOP otherwise — no degraded mode in automated runs); facts non-empty; gaps[] listed explicitly
  PROVENANCE TIERS (trust field):
        T1 structured fields (variants, options, prices, type, tags, shop settings) — fully trusted
        T2 spec-formatted key:value lines inside body_html (e.g. "Width: 60 inch") — usable, labeled "merchant-stated"
        T3 prose claims inside body_html — UNVERIFIED unless corroborated by T1/T2; flag, don't reuse
        Pasted AI-chat artifacts (e.g. stray chat CSS classes) demote the WHOLE body_html to T3 + provenance flag.

LAYER research (agent fast-tier, required)
  IN:   seed terms (from confirmed brand profile + piece target), country
  OUT:  KeywordCandidate[] { keyword, volume: number|null, kd: number|null, intent, parentTopic, source: provider|web-estimate } — RAW, no self-filtering
  PASS: ≥1 candidate; every row tagged with data source; volume/kd MAY be null when source=web-estimate (never fabricate numbers)

LAYER filter (code, required)
  IN:   KeywordCandidate[], catalog index (product titles/types/tags, collection titles)
  OUT:  kept[] + dropped[] with reasons (PLP/SKU patterns for articles; head/category + sibling-SKU terms for product rewrites; competitor brands; near-me)
  PASS: deterministic — rules in code, never delegated to a model
  HEAD-TERM DEFINITION (operational): a keyword is head/category iff it token-matches ≥ max(8, 25% of catalog) products, OR equals a collection title or product type. Computed from the catalog index — never a model judgment.

LAYER serp-ownership (agent fast-tier fan-out, required)
  IN:   top N candidates, site authority estimate { dr: number|null, source: provider|web-estimate } (produced by ground from provider when connected, else a conservative web-estimate; null ⇒ treat as low-authority)
  OUT:  per candidate: { topUrls[], avgDR, owners[], winnable: yes|no|stretch } given the provided site authority
  PASS: every shortlisted candidate has an ownership verdict

LAYER select (code + agent strong-tier, required)
  IN:   kept candidates + ownership + history/registry state
  OUT:  { primary, secondaries[], exclusions[] (cannibalization routing), historyDecision: net-new|spoke|refresh }
  PASS: firewall consulted; refresh-instead-of-duplicate honored; product rules: product-defining + variant terms only
  FIREWALL DEFINITION: reject/route a candidate if (a) the exact keyword already has a primary owner page in the project registry, (b) it shares a parent topic at the SAME intent with an owned keyword on another page, or (c) its top-10 SERP overlaps ≥30% with an owned keyword's SERP at the same intent. Different intent on a shared topic ⇒ allowed as a spoke with an internal link to the owner.
```

## Article pipeline

```
LAYER angle (agent strong-tier panel, toggle - articles)
  IN:   brand md, primary keyword, SERP context
  OUT:  4 lens angles (contrarian | data-led | buyer-decision | maker-pain) + chosen one with why
  PASS: chosen angle is specific enough to be a subject line

LAYER outline+critic (agents strong+fast, required - articles)
  IN:   angle, keywords, word target
  OUT:  typed outline {title, slug, metaTitle, metaDesc, hook, sections[]{h2, reason, bullets}, faqs[]}
  PASS: ENFORCED loop — adversarial critic (fresh context, live SERP) returns pass|revise+issues;
        regenerate fixing EVERY issue; cap 3 rounds; NEVER draft on a failing outline (hard stop + surface issues)

LAYER draft (agent strong-tier + web, required - articles)
  IN:   outline, FactsTable, brand md, internal-link candidates
  OUT:  semantic HTML: one h1, inline-cited claims (descriptive anchors), FAQ, JSON-LD Article+FAQPage, image slots
  PASS: no uncited factual claims; images as visible placeholder figures w/ data-image-prompt (never empty src)
```

## Product-rewrite pipeline

```
LAYER rewrite (agent strong-tier, required - products)
  IN:   FactsTable, selected keywords, brand md, reference structure (minky preview)
  OUT:  body HTML (lead, who-it's-for, spec table, FAQ), metaTitle, metaDesc, Product JSON-LD, variant keyword→variant map
  PASS: every claim ∈ FactsTable (T1/T2 only; T3 never asserted); structure matches reference; no aggregateRating without real reviews
  NOTES: who-it's-for framing derived from VERIFIED attributes (pattern, units sold, price ladder, dimensions) counts as grounded when phrased as suitability, not as user claims. Variant map covers only variants whose names have generic search demand; brand-coined colorway names are exempt (note them, don't force-map). JSON-LD priceCurrency comes from store context (ground layer), never assumed. Word target for product bodies: 250-500 words (configurable), computed not estimated.
```

## Quality layers (both pipelines)

```
LAYER aeo-check (code+agent fast, toggle, default on)
  IN:   draft HTML
  OUT:  AEO findings per inputs/aeo-optimization-skill (3-sentence test, extractability, differentiation, one-paragraph test)
  PASS: blocking findings fixed before verifier

LAYER citation-verify (agent fast-tier fan-out, toggle, default on - articles)
  IN:   every external citation {url, anchor, claim}
  OUT:  per citation: { loads: bool, supportsClaim: bool, authorityOk: bool }
  PASS: any failure is blocking → remove/replace source and rewrite the sentence

LAYER guardrails (code + agent fast, required)
  IN:   draft, FactsTable, trademark list, regulated-claims patterns
  OUT:  flags[] { type: trademark|regulated|gap|other, severity, note } — refuse-and-flag, never silently fix
  PASS: BAD-severity flags block; WARN flags surface in review UI

LAYER gates (code, required)
  IN:   draft + brand hard rules
  OUT:  violations[] (em dash, emoji headings, banned words, h1 count, slug length, computed word count, JSON-LD parse, meta lengths)
  PASS: zero violations after ≤1 repair round

LAYER verify (agent strong-tier, FRESH CONTEXT, required)
  IN:   final piece + RUBRIC.md Part A + FactsTable
  OUT:  { verdict: pass|fail, perGate: {...}, claimTrace: {claim→source}[] }
  PASS: builder cannot mark the piece done without this verdict = pass; 2 fails → piece self-flags for human triage
  NOTE: in automated runs the verifier MUST be an independent context. Manual/dry runs may substitute a self-check but must label the verdict "self-check" (it never satisfies this layer's PASS).
  EM-DASH SCOPE (for the gates + verify layers): zero em dashes in ALL emitted content — body HTML, meta fields, JSON-LD strings, and preview chrome.
```

## Optional layers (P1)

```
LAYER image-gen (Nano Banana, toggle)
  IN:   data-image-prompt + alt + title from draft figures
  OUT:  generated images uploaded to Shopify CDN; figure src replaced
  PASS: alt/title preserved; failure degrades to placeholder (never blocks the piece)

LAYER schedule (code/cron, toggle)  — recurring runs enqueue pieces like on-demand runs
```

## Review-loop workflow (separate, small)

```
LAYER comment-ingest (code, required)
  IN:   anchored comments [{anchor: {selector, textQuote}, body, modality: typed|voice}], or parsed email reply
  OUT:  normalized FeedbackSet bound to piece version N

LAYER surgical-edit (agent strong-tier, required)
  IN:   piece vN + FeedbackSet + karpathy rules (touch ONLY what each comment asks)
  OUT:  piece vN+1 + per-comment resolution notes

LAYER span-diff-verify (code, required)
  IN:   vN, vN+1, FeedbackSet anchors
  OUT:  { surgical: bool, untouchedSectionsChanged: [...] }
  PASS: edits outside commented spans (beyond mechanical renumbering) = fail → redo

LAYER publish (code, required)
  IN:   approved piece
  OUT:  version snapshot saved BEFORE push → Shopify mutation → live URL recorded; rollback = restore snapshot
  PASS: human approval recorded (button or parsed email approval); snapshot exists; post-push fetch confirms live content
```
