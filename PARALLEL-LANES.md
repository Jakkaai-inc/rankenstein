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
- Lane A: **CONTRACTS FROZEN 2026-06-13** — `prisma/schema.prisma` + `src/types/contracts.ts` pushed to main. Lanes B/C/D may build against them now.
- Lane A STATE (update 2026-06-13 ~13:00, terminal/API-billing): GOAL-CHECK 4/5. DONE = app shell + auth, brand flow, run orchestrator, server-side run route, deploy pipeline. THIS SESSION: rebuilt+redeployed HEAD (dae58d4) via CodeBuild->ECR->App Runner autodeploy (deploy SUCCEEDED 12:57); this flipped #2 auth-guard 500->307 LIVE. #6 review-queue GREEN (15 PENDING_REVIEW + 5 triage for EZ Fabric; `seed-and-run 10` batch). Remaining FAIL = **#8 live publish+rollback, BLOCKED on Lane B** (no `src/lib/shopify`/`src/app/api/shopify` code on main yet). Schema/contracts already support B+D (ContentVersion.isLivePush + publishedUrl/publishedAt; Comment.anchor/modality) so integration is pure wiring once they land. Integrator is READY and waiting on Lane B (publish path -> unblocks #8) and Lane D (review UI -> #7). Infra/secrets: `/Users/gevbalyan/Claude/rankenstein-infra.local.md` (untracked). RDS SG sg-00071a2609e2ee785 open to 0.0.0.0/0 for the day (teardown after). App Runner svc .../rankenstein-web/6e7161d50dc84d9dbe93c6f4666687b5 serving rankenstein.app.
- Lane B: SHOPIFY CONNECTOR DONE (unblocks #8) — `src/lib/shopify/*` + `src/app/api/shopify/*`, 0 tsc errors. Non-embedded OAuth: `GET /api/shopify/install?projectId=&shop=` -> Shopify authorize -> `GET /api/shopify/callback` (request-HMAC + signed-state verify, offline token + store context [currency/locale/primaryDomain/blogId] persisted on ShopifyConnection). Catalog sync `POST /api/shopify/sync {projectId}` -> Page rows (products via GraphQL, blog articles via REST). PUBLISH `POST /api/shopify/publish {contentItemId}` (REQUIRES ContentItem.status=APPROVED — human-approval rule): snapshots LIVE store state into a ContentVersion (isLivePush=true) BEFORE the push, then productUpdate (descriptionHtml+SEO) or article create/update; sets status=PUBLISHED + publishedUrl/publishedAt. ROLLBACK `POST /api/shopify/rollback {contentItemId, version?}` re-pushes a snapshot (default = latest pre-publish live snapshot), snapshotting current state first; sets status back to APPROVED. STATUS `GET /api/shopify/status?projectId=`. Integrator: connect a store, then publish any APPROVED item -> #8 green. NEXT: live smoke against ezfabricinc once one item is APPROVED; webhooks (app/uninstalled) if time. **Lane E impact: 6 new routes under /api/shopify (install/callback/sync/publish/rollback/status); all except OAuth accept cookie OR bearer auth.**
- Lane C: PRODUCT-REWRITE PATH DONE — full workflow `ground→research→filter→serp→select→rewrite→aeo→guardrails→gates→verify` in `src/lib/engine/*`, wired to frozen contracts.ts. 51 tests green vs the real 633-product snapshot; 0 tsc errors. Public API: `import { runProductRewrite, renderPreview, offlineMinkyDeps } from '@/lib/engine'`. Demo: `npx tsx src/lib/engine/selfcheck.ts` (grounded PASSES, naive rewriter CAUGHT by verifier on fabricated GSM/cert/reviews, artifact body demoted+self-flags). Passes RUBRIC Part A. Live agents plug into the Research/Serp/Rewriter/Verifier interfaces (need `@anthropic-ai/sdk` dep, see LANE-REQUESTS). NEXT: article path + live Anthropic-backed providers.
- Lane D: REVIEW LOOP DONE — `/review` queue + `/review/:pieceId` anchored-comment canvas (`src/components/preview/PiecePreview.tsx`: pin a field, highlight->type, highlight->SPEAK via Web Speech API; offsets re-anchored by `anchor.ts` html<->text map). Surgical-edit + span-diff-verify in `src/app/review/surgical.ts`: rewrites ONLY commented spans (deterministic splice, edits via Opus 4.8) then an INDEPENDENT token-diff proves nothing else moved; non-surgical edits are REFUSED, not written. Server actions (`src/app/review/actions.ts`): addComment / applyReview / approve (-> status APPROVED, feeds Lane B publish) / rollback / requestEmailReview; every edit snapshots a ContentVersion. Email (`src/lib/email/*`): SES "Pending review" send + S3 (`rankenstein-inbound-mail`, us-east-1) inbound parse -> "I approve" approves, any other reply -> global Comment + CHANGES_REQUESTED; webhook `POST /review/api/inbound`. VALIDATED: 24 lane tests green; live surgical-edit smoke PASS vs a real PENDING_REVIEW piece (span rewritten, h1 + rest untouched, surgical=true). Renders the 9 existing PENDING_REVIEW pieces. AWS SDK deps + Lane E impact noted in LANE-REQUESTS (email dry-runs without the SDK).
- Lane E: REGISTERED 2026-06-13 — mobile app; location TBD; building against current HTTP API + frozen contracts + auth/session + review/publish flow. (Lane A maintains this line from pasted status until E's location is decided.)

## CONTRACTS FROZEN — the law for all lanes
- DB model: `prisma/schema.prisma` (Account, Session, Project, BrandProfile, ShopifyConnection, Page, Keyword, RunConfig, Run, ContentItem, ContentVersion, Comment).
- TS types: `src/types/contracts.ts` (FactsTable, KeywordCandidate, KeywordSelection, RunConfig, PieceTarget, PieceResult, GuardrailFlag, Violation, ContentBrief, VerifierVerdict, ReviewComment, FeedbackSet, SurgicalEditResult).
- Need a new field/type/dependency? Append to `LANE-REQUESTS.md` and ping Gev — only Lane A edits schema, contracts, package.json.
