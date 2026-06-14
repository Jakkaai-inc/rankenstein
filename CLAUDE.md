# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> This is the Claude Fable 5 Build Day project (2026-06-13). Before writing product code, read the in-repo source-of-truth docs in order: `inputs/BRIEF.md` (what/why, P0/P1 tiers), `inputs/RUBRIC.md` (machine-checkable definition of done; an independent verifier agent grades against it), `inputs/LAYER-CONTRACTS.md` (typed contract for every pipeline stage), and `inputs/reference-output-minky-preview.html` (the structure product-rewrite output must match). `PARALLEL-LANES.md` is the live coordination board (lane ownership + status). Everything in `inputs/` predates the event; all product code is authored in-session.

## Commands

```bash
npm run dev            # Next.js dev server (web app)
npm run build          # Next.js production build (standalone output, for Docker)
npm test               # vitest run — full suite, one-shot
npx vitest run src/lib/engine/__tests__/gates.test.ts   # single test file
npx vitest                                              # watch mode
npm run db:migrate     # prisma migrate dev (local schema changes)
npm run db:deploy      # prisma migrate deploy (prod)
npx prisma generate    # regenerate client after schema edits (also runs postinstall)
```

Operational scripts (all `npx tsx scripts/<name>.ts`, all load `.env` via `dotenv/config`):

```bash
npx tsx scripts/seed-and-run.ts [limit]   # seed EZ Fabric project + run a live catalog rewrite batch into the review queue (the main e2e driver)
npx tsx scripts/goal-check.ts             # machine grader for GOAL.md — PASS/FAIL per criterion against the deployed app; hillclimb until N/N
npx tsx scripts/connect-store.ts [shop] [siteUrl]   # connect Shopify via a store custom-app Admin token (set EZFABRIC_ADMIN_TOKEN in env, never on CLI)
npx tsx scripts/sync-catalog.ts           # sync connected store catalog into Page rows
npx tsx scripts/reset-pieces.ts           # wipe pieces/versions/comments/runs for the EZ Fabric project
npx tsx scripts/dbcheck.ts                # DB connectivity sanity check
```

Engine demos (no DB, no live store — pure functions + fixtures):

```bash
npx tsx src/lib/engine/selfcheck.ts       # offline: product grounded PASS / naive CAUGHT / artifact self-flag; article grounded PASS / uncited-stat CAUGHT
npx tsx src/lib/engine/smoke-live.ts      # live: product path with real model calls -> pending_review + verifier pass
```

Verification gate before declaring work done: `npm test` green AND `npx tsc --noEmit` clean (the latter is the project's standing bar — full-project typecheck).

## Architecture

A Next.js 16 / React 19 app + an autonomous, verifier-gated content engine. The product researches winnable keywords, writes article/product content grounded only in verifiable source data, structures it for search + answer engines (AEO), grades itself against `inputs/RUBRIC.md` with an independent verifier agent, and publishes to Shopify only after human approval (with version snapshots + rollback).

### The engine is the hero — `src/lib/engine/`

Each piece is **one pure workflow run** built from typed layers (`inputs/LAYER-CONTRACTS.md` is the spec; layers live in `src/lib/engine/layers/`). The orchestrator is `pipeline.ts`, exposing `runProductRewrite`, `runArticle`, and `runPiece` (dispatches by content type). Stage order for articles: ground → research → filter → serp-ownership → select → angle → outline+critic (enforced adversarial loop) → draft → citation-verify → aeo → guardrails → gates → verify.

The design split that governs everything:

- **Deterministic layers are plain code, never a model** — `ground`, `filter` (head-term / cannibalization rules), `select` (the registry firewall), `gates` (em-dash/emoji/banned-word/word-count/JSON-LD checks), span-diff. These are testable pure functions and must stay that way.
- **Judgment layers are injected providers** (`research`, `serp`, `rewrite`/`draft`, `angle`, `outline+critic`, `citation-verify`, `verify`). The orchestrator depends on provider *interfaces* (`src/lib/engine/providers.ts`), so the same pipeline runs **offline** (`offlineMinkyDeps`/`offlineArticleDeps` — fixtures + deterministic graders, in `offline.ts`) or **live** (`liveDeps`/`liveArticleDeps` — Anthropic-backed, in `providers/live.ts`). Tests and demos run offline; the real run path uses live deps.

Hard rules are enforced *in the orchestrator and the deterministic layers*, not left to model discretion:
- `ground` HARD STOPs (`BrandUnconfirmedError`) if the brand profile is unconfirmed — no degraded mode in automated runs.
- Guardrail BAD-severity flags block (refuse-and-flag, never silently fix); facts carry provenance tiers T1/T2/T3 and only T1/T2 may be asserted.
- Gates get exactly one repair round; remaining violations block.
- `verify` is the gate to completion: in automated runs it **must be an independent context** (separate Anthropic client — see `providers/anthropic.ts` `makeClient`); a self-check verdict can never mark a piece done. Two verify failures → the piece self-flags for human triage.
- No fabricated numbers (volume/kd may be `null` when `source=web-estimate`); no `aggregateRating` JSON-LD without real reviews.

The public engine surface is `import { ... } from '@/lib/engine'` (re-exported from `src/lib/engine/index.ts`) — import from there, not deep paths.

### Run orchestration — `src/lib/run/orchestrator.ts`

`runCatalogRewrite` bridges a dashboard/script run to the engine to the DB review queue: pulls products (public `products.json`, no OAuth needed for grounding), builds the catalog index, **dedups by `sourceRef`** (skips already-processed products so reruns advance), **priority-orders** (thin/AI-artifact bodies first), enforces a **spend soft-stop**, and persists each result as a `ContentItem` (`PENDING_REVIEW` or `FAILED`/flagged) + `ContentVersion` v1. A confirmed brand profile is required or it throws. Per-piece token ceiling is enforced inside the engine via `RunConfig`.

### Data model — `prisma/schema.prisma` (Postgres)

Multi-tenant ready (`Account` → `Project`) but the demo drives one project. Key shapes: `BrandProfile.confirmed` gates all generation (the ask-first rule); `Keyword` is the **registry / cannibalization firewall state** (`@@unique([projectId, keyword])`, owner-page mapping); `RunConfig` holds the layer toggles + depth/readability/groundedness knobs + token ceiling + spend soft-stop; `ContentItem` is the unit of work (status machine: DRAFTING → PENDING_REVIEW → APPROVED → PUBLISHED, with CHANGES_REQUESTED/REJECTED/FAILED); `ContentVersion` is the pre-push snapshot enabling rollback (`isLivePush` marks the captured live state); `Comment` carries the anchored review feedback (span/global anchor + text/voice modality).

### Lanes (file ownership)

The app was built in parallel "lanes"; ownership boundaries still describe the layout:
- **Lane A — foundation/integrator:** repo root, `prisma/`, `src/types/contracts.ts` (the frozen TS contracts — names/shapes are law), app shell `src/app/projects/*` + auth-lite, deploy pipeline. Only Lane A edits schema, `contracts.ts`, and `package.json`.
- **Lane B — Shopify:** `src/lib/shopify/*` + `src/app/api/shopify/*` (OAuth install/callback, catalog sync, publish + snapshot + rollback, status). Publish **requires `status=APPROVED`**.
- **Lane C — engine:** `src/lib/engine/*` (above).
- **Lane D — review UX + email:** `src/app/review/*`, `src/components/preview/*` (anchored-comment canvas: pin field / highlight→type / highlight→speak via Web Speech API), the surgical-edit + span-diff-verify loop (`src/app/review/surgical.ts` — edits ONLY commented spans, an independent token-diff proves nothing else moved, non-surgical edits are REFUSED), `src/lib/email/*` (SES send + S3 inbound parse).
- **Lane E — mobile:** `mobile/` (Expo / expo-router, separate package, consumes the HTTP API). Excluded from the root `tsconfig`.

When changing a Lane-E-facing surface (an API route/payload, a frozen contract, the auth/session scheme, or review/publish behavior), add a `Lane E impact: ...` line to the commit message.

### API surface

Two route families. `/api/v1/*` (programmatic: auth login/logout, `me`, projects, brand draft/confirm, run) uses **bearer-token** auth via `src/lib/api/http.ts` (`requireAccount`, the `handle()` envelope mapping `ServiceError`/`ZodError`/`SyntaxError` to clean responses) over `src/lib/services/*`. `/api/shopify/*` accepts **cookie OR bearer** auth (except OAuth). Session model is `src/lib/session.ts` / `src/lib/services/auth.ts`.

## Model tiers (important gotcha)

The live engine run path (`src/lib/engine/providers/anthropic.ts`) is the source of truth: `MODELS = { strong: ANTHROPIC_MODEL_STRONG ?? 'claude-opus-4-8', fast: ANTHROPIC_MODEL_FAST ?? 'claude-haiku-4-5-20251001' }`. `strong` = prose/angle/outline/verify; `fast` = research/critique/extraction. **Do not send `temperature`** — Opus 4.8 rejects it (`structuredCall` omits it deliberately).

A second, separate `MODELS` constant in `src/lib/llm.ts` reads *different* env vars (`RK_MODEL_STRONG`/`RK_MODEL_FAST`) with different defaults and sends a temperature — it is not the engine path. Prefer the engine providers; if you touch `llm.ts`, know it is a distinct client.

## Deploy

Next standalone in Docker (`Dockerfile`, Node 22). CI/CD is CodeBuild (`buildspec.yml`) → ECR → App Runner autodeploy on push to `main` (web, behind https://rankenstein.app). Worker is `npm run worker` (`tsx src/worker/index.ts`) on ECS Fargate. Postgres on RDS. Secrets are supplied via env / the untracked `/Users/gevbalyan/Claude/rankenstein-infra.local.md`, never committed. Deploy early and often.

## Conventions enforced by gates (not just style)

No em dashes **anywhere** emitted (body HTML, meta, JSON-LD strings, preview chrome). No emojis in headings. Honor brand banned-word + trademark lists. These are checked by the `gates` layer and re-checked by `verify`; treat them as build-breaking, not cosmetic.
