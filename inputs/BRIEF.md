# Rankenstein — Build Brief

> **Provenance**: written 2026-06-12, the day BEFORE the Claude Fable 5 Build Day. Everything in `inputs/` is pre-event preparation (brief, rubric, layer contracts, the AEO framework, one reference output, and a catalog snapshot). All product code in this repository is built during the event, in-session, by Claude Fable 5.

## The problem

Most AI content tools spin generic fluff: no real keyword research, no grounding, invented facts, no accountability loop. Merchants and agencies need content that (a) targets keywords it can actually win, (b) never claims anything the source data doesn't support, (c) is structured so search engines AND answer engines (LLMs) can extract and cite it, and (d) ships only after passing explicit quality gates plus a human approval.

## Who it's for

- **Site owners** (self-serve): connect a store, configure once, review by email.
- **Agencies** (the trust layer): run many client projects, review at scale.
- Today's real case: **Jakka AI** (platform) → **Rankenstein** (this open-source engine) → **Stop Scrolling** (agency, Jakka's customer) → **EZ Fabric** (the agency's DTLA client, a real Shopify fabric store whose full catalog gets rewritten and published today).

## What we're building (this event)

A standalone web app + autonomous content engine:

**P0 — the spine (must work end-to-end):**
1. Create project → crawl the site → draft brand guidelines → human confirms (nothing generates before confirmation — the ask-first rule).
2. Connect Shopify via OAuth (products read/write, content read/write).
3. Configure: content type (article | product rewrite), goal, depth/readability/groundedness, quality knobs; toggle pipeline layers (each layer is a typed workflow stage — see `LAYER-CONTRACTS.md`).
4. The app derives and displays the **qualification checklist** (from `RUBRIC.md`) a piece must pass to become a publish candidate.
5. Run the engine: per piece, one workflow — research (native web fallback or Ahrefs when connected) → generate → AEO-structure → cite → independent verifier grades against the rubric → pass or self-flag.
6. **Pending review** → email notification → reviewer opens the piece in the app's preview template → anchored comments (pinned note, select-span + type, select-span + talk) → **surgical revision** (only commented spans change; a verifier proves it) → approve → **publish live to Shopify** with a version snapshot and one-click rollback.
7. Process the **whole EZ Fabric catalog**, priority-ordered, with per-piece token ceilings and triage (two rubric failures → self-flag, exit queue).

**P1 — after the spine demos green:** image generation (Nano Banana renders the engine's image prompts), real cron scheduling, email-reply feedback/approval via inbound webhook.

**Stubs (visible, honest):** billing ledger, BrightLocal connector.

## What done looks like

`RUBRIC.md` is the contract. The builder may not declare a tier complete until an independent verifier agent grades it green. Run-level: tests pass, the deployed URL serves, OAuth round-trips, a canary publish + rollback is proven on the live store, and an anchored comment produces a provably-surgical diff. Per-piece: every gate in the rubric.

## Hard rules (non-negotiable, enforced in code)

- **Never invent.** Every factual claim traces to the product/source data; gaps are flagged, not guessed.
- **Refuse-and-flag beats degrade-and-guess.** Unreadable site → ask the human. Missing spec → flag it.
- No em dashes; no emojis in headings; honor brand banned-word lists.
- No fabricated JSON-LD fields (no `aggregateRating` without real reviews).
- Nothing publishes without explicit human approval. Ever.
- Per-piece token ceiling and global spend soft-stop (the run must finish inside the event credit budget).

## Reference output

`inputs/reference-output-minky-preview.html` — a hand-validated EZ Fabric product rewrite. The engine's product output must match its structure: keyword map with roles and exclusions, grounded before/after, spec table, FAQ, meta + JSON-LD, and guardrail flags (trademark, data gaps, grounded-checklist).
