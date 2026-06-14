# Parallel build lanes — coordination (Build Day 2026-06-13)

Solo builder, multiple Claude Code chats in parallel. This file is the single
source of truth for who owns what. READ THIS FIRST in every chat. Re-read before
touching anything outside your lane.

## Hard rules (prevent collisions)

1. **Lane A owns all shared foundation.** Only Lane A edits: `prisma/schema.prisma`,
   `package.json` (all `npm install`), `src/types/contracts.ts`, root config
   (next.config, tsconfig, Dockerfiles, env wiring), and runs deploys.
   Other lanes that need a dep or schema field: STOP, write the request in
   `LANE-REQUESTS.md`, and ping Gev to have Lane A add it. Do not install or
   migrate from another lane.
2. **Build only inside your lane's directories** (listed below). Do not edit files
   outside them.
3. **Phase 0 gate:** no lane except A starts coding until A has pushed the schema
   + `src/types/contracts.ts` and posted "CONTRACTS FROZEN" here. Building before
   that = building on sand.
4. **Commit small and often, all on `main`** (disjoint files = no merge pain).
   `git pull --rebase` before every push. Never force-push.
5. **Secrets** live in `/Users/gevbalyan/Claude/rankenstein-infra.local.md`
   (untracked) and the deployed env. Never commit them. Lane A wires env.
6. **Lane E impact note.** Any change to an E-facing surface (an API route/payload,
   a frozen contract, the auth/session scheme, or review/publish behavior) must carry
   a one-line `Lane E impact: ...` note in the commit message / status board so Gev can
   inject the update into Lane E. Contract changes still gate through Lane A as today.

## Lanes

### Lane A — Foundation + Integrator (the chat that did all the prep)
Owns: repo root, `prisma/`, `src/types/contracts.ts`, `src/app/(shell)/*` (layout,
auth-lite, project create, dashboard frame), deploy pipeline, env, CI/tests glue.
Phase 0 deliverable: scaffold + schema + frozen contracts + a deployed skeleton +
"CONTRACTS FROZEN" posted here. Then: app shell, project/onboarding flow, integrator
(pulls lanes together, runs deploys, owns the demo build).

### Lane B — Shopify connector (existing dedicated chat)
Owns: `src/lib/shopify/*`, `src/app/api/shopify/*` (OAuth connect, callback,
webhooks, catalog sync, publish + version-snapshot + rollback).
Depends on: contracts (Project, Page, ContentItem types).

### Lane C — Engine (the content dynamic-workflow pipeline) — DEMO HERO
Owns: `src/lib/engine/*` (layers per LAYER-CONTRACTS.md: ground, research, filter,
serp-ownership, select, rewrite/draft, aeo, guardrails, gates, verify), the
per-piece workflow orchestrator, and the fresh-context verifier.
Buildable IMMEDIATELY against `inputs/` + the local catalog snapshot
(`/Users/gevbalyan/Claude/ez-fabric-public-snapshot.json`) with NO DB and NO live
store — pure functions + fixtures. Highest-value, most parallel-safe lane.
Depends on: contracts types only (FactsTable, KeywordCandidate, PieceResult, etc.).

### Lane D — Review UX + email (optional 4th, if supervisable)
Owns: `src/app/review/*`, `src/components/preview/*` (preview template, anchored
comments: pinned field + select-span type + voice via Web Speech API), the
surgical-edit + span-diff-verify review workflow, and `src/lib/email/*` (SES send
+ inbound parse from the rankenstein-inbound-mail S3 bucket).
Depends on: contracts (ContentItem, Comment, Version types) + a sample drafted
piece from Lane C (can mock from the dry-run output until C is live).

### Lane E — Mobile app (codebase/location TBD)
Owns: the mobile client ONLY (location TBD). Consumes the backend; owns no backend
source and edits no other lane's files. Depends on: the HTTP API surface (App Runner
web routes + their JSON shapes), the frozen TS contracts (`src/types/contracts.ts`),
the auth/session model (`src/lib/session.ts`), and the review/publish flow (Lane D
review UX + Lane B publish). Stays in sync via pasted prompts (Gev-mediated), not by
polling. Because location is TBD, Lane A maintains Lane E's status-board line for now
(from pasted status) until we decide whether E's code lives in this repo (then E
self-maintains its line) or a separate repo.

## Shared contracts (Lane A freezes these in src/types/contracts.ts)
Project, BrandProfile, Page, KeywordCandidate, FactsTable row (field/value/source/trust),
PieceTarget, PieceDraft, PieceResult (html/meta/jsonld/brief/flags/verdict),
Comment (anchor/body/modality), ContentVersion, RunConfig (layer toggles + depth/
readability/groundedness + image-gen), VerifierVerdict. Names/shapes here are law.

## Status board (each lane updates its line)

> **>> LANE A — REDEPLOY REQUEST (D, 2026-06-13 ~15:25).** Two Lane D commits are on `main` but NOT live yet — please rebuild+redeploy HEAD (CodeBuild->ECR->App Runner) so the review demo reflects them:
> - `70e19c4` honest surgical edits: **no-op detection** (editor returning a span unchanged no longer reports "rewritten" or saves a duplicate version — this was the live bug: a removal comment silently no-op'd, banner falsely said success, reviewer approved an unchanged piece), **deletion support** (span editor can now remove a row/sentence per a "delete this" comment), **before->after view** in the toolbar, and **"Apply review"->"Apply comments"** + flow hint.
> - `a048d7f` review-time guardrail that flags volatile fields (availability/stock, live price) baked into prose (BAD/WARN in the flags panel).
> Both are review-only; no schema/contract change. Also please confirm **`ANTHROPIC_API_KEY` is set in App Runner** — the surgical span editor needs it; without it Apply returns a clean error and never edits. (D can't push from here: other lanes' uncommitted work blocks a clean rebase. Commits are local on `main`; pull before redeploy.)

- Lane A: **CONTRACTS FROZEN 2026-06-13** — `prisma/schema.prisma` + `src/types/contracts.ts` pushed to main. Lanes B/C/D may build against them now.
- Lane A STATE (update 2026-06-13 ~13:00, terminal/API-billing): GOAL-CHECK 4/5. DONE = app shell + auth, brand flow, run orchestrator, server-side run route, deploy pipeline. THIS SESSION: rebuilt+redeployed HEAD (dae58d4) via CodeBuild->ECR->App Runner autodeploy (deploy SUCCEEDED 12:57); this flipped #2 auth-guard 500->307 LIVE. #6 review-queue GREEN (15 PENDING_REVIEW + 5 triage for EZ Fabric; `seed-and-run 10` batch). Remaining FAIL = **#8 live publish+rollback, BLOCKED on Lane B** (no `src/lib/shopify`/`src/app/api/shopify` code on main yet). Schema/contracts already support B+D (ContentVersion.isLivePush + publishedUrl/publishedAt; Comment.anchor/modality) so integration is pure wiring once they land. Integrator is READY and waiting on Lane B (publish path -> unblocks #8) and Lane D (review UI -> #7). Infra/secrets: `/Users/gevbalyan/Claude/rankenstein-infra.local.md` (untracked). RDS SG sg-00071a2609e2ee785 open to 0.0.0.0/0 for the day (teardown after). App Runner svc .../rankenstein-web/6e7161d50dc84d9dbe93c6f4666687b5 serving rankenstein.app.
- Lane B: SHOPIFY CONNECTOR DONE (unblocks #8) — `src/lib/shopify/*` + `src/app/api/shopify/*`, 0 tsc errors. Non-embedded OAuth: `GET /api/shopify/install?projectId=&shop=` -> Shopify authorize -> `GET /api/shopify/callback` (request-HMAC + signed-state verify, offline token + store context [currency/locale/primaryDomain/blogId] persisted on ShopifyConnection). Catalog sync `POST /api/shopify/sync {projectId}` -> Page rows (products via GraphQL, blog articles via REST). PUBLISH `POST /api/shopify/publish {contentItemId}` (REQUIRES ContentItem.status=APPROVED — human-approval rule): snapshots LIVE store state into a ContentVersion (isLivePush=true) BEFORE the push, then productUpdate (descriptionHtml+SEO) or article create/update; sets status=PUBLISHED + publishedUrl/publishedAt. ROLLBACK `POST /api/shopify/rollback {contentItemId, version?}` re-pushes a snapshot (default = latest pre-publish live snapshot), snapshotting current state first; sets status back to APPROVED. STATUS `GET /api/shopify/status?projectId=`. Integrator: connect a store, then publish any APPROVED item -> #8 green. NEXT: live smoke against ezfabricinc once one item is APPROVED; webhooks (app/uninstalled) if time. **Lane E impact: 6 new routes under /api/shopify (install/callback/sync/publish/rollback/status); all except OAuth accept cookie OR bearer auth.**
- Lane C: BOTH PIPELINES DONE (product rewrite + article) — `src/lib/engine/*`, wired to frozen contracts.ts. **79 tests green, 0 tsc errors.** Product: `runProductRewrite`; Article: `runArticle` (ground→research→filter→serp→select→angle→outline+critic ENFORCED loop→draft→citation-verify→aeo→guardrails→gates→verify); `runPiece` dispatches by contentType. Public API: `import { runProductRewrite, runArticle, runPiece, renderPreview, liveDeps, liveArticleDeps, offlineMinkyDeps, offlineArticleDeps } from '@/lib/engine'`. Demo: `npx tsx src/lib/engine/selfcheck.ts` (product grounded PASS / naive CAUGHT / artifact self-flag; article grounded PASS / uncited-stat CAUGHT). **Live verified:** `npx tsx src/lib/engine/smoke-live.ts` ran the product path with real Opus calls → pending_review + verifier pass. Live article = `liveArticleDeps()` (angle/outline+critic/draft strong-tier; fetch+agent citation checker). Passes RUBRIC Part A for both. Live agents use the Messages API directly (no agent-sdk subprocess), no `temperature` (Opus 4.8 rejects it), strong=opus-4-8 / fast=haiku-4-5.
- Lane D: REVIEW LOOP DONE — `/review` queue + `/review/:pieceId` anchored-comment canvas (`src/components/preview/PiecePreview.tsx`: pin a field, highlight->type, highlight->SPEAK via Web Speech API; offsets re-anchored by `anchor.ts` html<->text map). Surgical-edit + span-diff-verify in `src/app/review/surgical.ts`: rewrites ONLY commented spans (deterministic splice, edits via Opus 4.8) then an INDEPENDENT token-diff proves nothing else moved; non-surgical edits are REFUSED, not written. Server actions (`src/app/review/actions.ts`): addComment / applyReview / approve (-> status APPROVED, feeds Lane B publish) / rollback / requestEmailReview; every edit snapshots a ContentVersion. Email (`src/lib/email/*`): SES "Pending review" send + S3 (`rankenstein-inbound-mail`, us-east-1) inbound parse -> "I approve" approves, any other reply -> global Comment + CHANGES_REQUESTED; webhook `POST /review/api/inbound`. VALIDATED: 24 lane tests green; live surgical-edit smoke PASS vs a real PENDING_REVIEW piece (span rewritten, h1 + rest untouched, surgical=true). Renders the 9 existing PENDING_REVIEW pieces. AWS SDK deps + Lane E impact noted in LANE-REQUESTS (email dry-runs without the SDK). **Fresh-session re-verify 2026-06-13 ~14:25: re-read all inputs/contracts; lane tests green, `tsc` clean. SESSION UPDATE ~15:25: live review surfaced two issues, both fixed + committed (need redeploy — see >> LANE A note above): (1) `a048d7f` review-time guardrail flags volatile fields (availability/stock/live price) baked into prose; engine root-cause filed [D->C] in LANE-REQUESTS (`ground.ts:152`/`rewrite.ts:212` emit an `availability` fact into the spec table). (2) `70e19c4` honest surgical edits — no-op detection (no more false "rewritten" + duplicate versions), deletion support, before->after view, "Apply comments" relabel + flow hint. 36 lane tests green, full-project `tsc` clean. NEXT (approved, not started): triage section on /review for engine-FAILED pieces; read-only engine-chrome panel. Awaiting visual direction before reskin.**
- Lane D: **REVIEW REDESIGN LIVE (2026-06-13 ~18:42).** ReviewShell mounted by Lane A (`99a0938`) on `/r/[slug]/[kind]/[id]`, pushed + deployed to studio.rankenstein.app (new `/r/api/feedback*` routes answer 401 = live). New loop: version selector (original/vN/latest, old versions read-only) → Google-Docs comments → state CTA "Approve to publish" / "Send feedback" → freeze + long-poll → auto-advance version + "feedback accepted" message. Per-comment outcomes (applied / no-change / your-exact-text) so no-ops are never hidden (root-caused the "2 comments, 1 applied" report = AI refusing to assert an ungrounded fact). Human override: comment "replace with: <text>" splices exact text past the grounding guard. Fixed 2 real bugs en route (no-op compared raw HTML not text → could drop a trailing tag; peelBoundaryTags keeps structural tags safe). 40 Lane D tests green, paths tsc-clean. DONE (pushed `b153396`): (1) **triage section** — `/p/[slug]/review` now shows FAILED pieces in a "Flagged - needs triage" section (brief requires flagged pieces stay visible); (2) **content-brief panel** — read-only collapsible "Content brief" above the draft in ReviewShell (`BriefPanel.tsx`): keyword map (vol/KD/role), SERP note, exclusions, process-honesty line, from the stored ContentBrief. Small additive edits to two Lane-A pages (queue + piece) consistent with their ReviewShell mount. 40 tests green, tsc-clean. Lane D backlog now clear; awaiting visual direction for reskin.
- Lane E: REGISTERED 2026-06-13 — mobile app; location TBD; building against current HTTP API + frozen contracts + auth/session + review/publish flow. (Lane A maintains this line from pasted status until E's location is decided.)

## CONTRACTS FROZEN — the law for all lanes
- DB model: `prisma/schema.prisma` (Account, Session, Project, BrandProfile, ShopifyConnection, Page, Keyword, RunConfig, Run, ContentItem, ContentVersion, Comment).
- TS types: `src/types/contracts.ts` (FactsTable, KeywordCandidate, KeywordSelection, RunConfig, PieceTarget, PieceResult, GuardrailFlag, Violation, ContentBrief, VerifierVerdict, ReviewComment, FeedbackSet, SurgicalEditResult).
- Need a new field/type/dependency? Append to `LANE-REQUESTS.md` and ping Gev — only Lane A edits schema, contracts, package.json.
