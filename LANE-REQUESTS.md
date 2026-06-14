# Lane requests

Cross-lane asks (new schema fields, shared types, npm deps). Lane A actions these.
Format: `- [LANE] request — status`

- [Onboarding→A] NEW LANE (Gev-assigned): I own the project-creation wizard. CLAIMED files: `src/app/p/new/*` (route + `actions.ts`) and `src/components/onboarding/*`. I touched ONE Lane A file minimally — added a "New project" link to `/p` (`src/app/p/page.tsx`) and kept your inline create form as the manual fallback. Brand-confirm SEAM: the wizard owns an inline confirm step (calls the existing `confirmBrand` via `POST /api/v1/projects/:id/brand/confirm`); your Settings keeps its edit-later form — please don't move/rename that confirm route. — FYI
- [Onboarding→A/infra] ENV ask for the demo-day Shopify pre-connect: add `RK_DEMO_SHOPIFY_DOMAIN` (the demo store, e.g. `something.myshopify.com`) and `RK_DEMO_SHOPIFY_TOKEN` (a `shpat_…` Admin API token) to the infra env + App Runner. The wizard's `preconnectDemoStore(projectId)` attaches that store to a new project via the existing verified path (`adminClient`→`fetchShopContext`→`saveConnection`). It degrades gracefully if unset (shows the yellow "pre-connected for demo" notice + a manual-connect fallback), so the build is green without it — but the live demo's auto-connect needs these two vars. — OPEN

- [C] Toolchain: RESOLVED — picked up your vitest 4 + tsx + tsconfig (bundler resolution). Engine tests now use vitest API + extensionless imports; `npx vitest run src/lib/engine` is green. No deps needed from you. — DONE
- [C] Test runner choice: RESOLVED — standardized on vitest (your `npm test`). — DONE
- [C] Contracts: DONE — adopted frozen `src/types/contracts.ts`. Engine re-exports shared types and flows `FactsRow[]` internally; 0 tsc errors. — DONE
- [C] Contract gap (non-blocking, nice-to-have): `ContentBrief` and `PieceResult` have no field for the **variant keyword→shade map**, which RUBRIC A6 + the reference preview require in the brief. Also `ContentBrief` lacks `gaps` and a per-secondary `volume/kd`/role. For now the engine returns a superset `EngineRunResult` (contract `PieceResult` + `.variantMap`, `.gaps`, `.aeo`, `.selection`, `.ground`) so nothing is lost; the canonical `result` field IS the contract `PieceResult`. If you want these first-class, add to `contracts.ts`: `ContentBrief.variantMap?: {keyword;volume;kd;variantValue}[]`, `ContentBrief.gaps?: string[]`, `PieceResult.variantMap?`. I'll switch to them when added. — OPEN
- [C] Verifier note: contract `VerifierVerdict.isSelfCheck` is honored. In automated runs the engine REQUIRES an injected independent-context verifier; a self-check verdict is returned but marked `isSelfCheck:true` and the piece status becomes `flagged` (never `pending_review`) unless an independent verifier passed it. Lane A/B: inject a fresh-context agent verifier via the `Verifier` interface for live runs. — FYI

### [C→A] Integration verification (ran 2026-06-13) — engine ↔ run orchestrator ↔ DB
VERIFIED GOOD: `src/lib/run/orchestrator.ts` (`runCatalogRewrite`) consumes the engine correctly (`runProductRewrite` via `liveDeps`), maps DB brand → `BrandProfile`, persists `PieceResult` → `ContentItem` + `ContentVersion v1` with correct status mapping (flagged/haltReason → FAILED, else PENDING_REVIEW). Full project `tsc` = 0 errors in `src/` (only an unrelated `next.config.ts` eslint-key error); 108 tests green. Priority-first + dedup + spend soft-stop + triage all present (Part B bulk gate covered). No engine changes needed.

THREE action items for Lane A (not engine bugs):
1. **LATENCY vs route timeout (blocking for a live demo).** A live piece took ~737s in the product smoke (two Opus calls: rewrite + verify dominate). `route.ts` has `maxDuration = 120` and `await`s the batch → it WILL time out before one piece finishes, even at `limit=1`. Fixes (no engine change): (a) set env `ANTHROPIC_MODEL_STRONG=claude-sonnet-4-6` — the engine already honors it; Sonnet is much faster for rewrite+verify; and/or (b) run the batch as a background job (don't await it in the request) and poll `Run` status; the orchestrator already updates `Run.done/flagged/spendUsd` per piece, so polling works. Recommend BOTH for the demo. For an instant, deterministic demo of the verifier-catch moment, `offlineMinkyDeps()` / `npx tsx src/lib/engine/selfcheck.ts` needs no API at all.
2. **Article path not wired into the bulk runner.** `runCatalogRewrite` only does `PRODUCT_REWRITE`. `runArticle`/`runPiece` + `liveArticleDeps()` are exported and ready; add an article branch (or a separate article-run) when you want articles in the queue. Non-blocking if the demo is product-first.
3. **Live-run preconditions** (env, not code): `ANTHROPIC_API_KEY` in App Runner, `BrandProfile.confirmed = true` (the orchestrator hard-throws otherwise — correct), and outbound network to `<siteUrl>/products.json`. Confirm these in the deployed env before the demo.

## Lane C (Engine) — detail

### Why no package.json dep is needed
Engine is pure TypeScript under `src/lib/engine/*` in erasable-only syntax (no
enums/namespaces/param-properties). Runs + tests with zero deps:
`node --test src/lib/engine/**/*.test.ts` and demo `node src/lib/engine/selfcheck.ts`.
No runtime npm deps (HTML handling + JSON-LD validation done in-engine w/ stdlib).

### Injected provider interfaces (other lanes wire live impls; engine stays pure)
- `ResearchProvider.keywords(seedTerms, country) => KeywordCandidate[]`
- `SerpProvider.ownership(candidates, siteAuthority) => SerpVerdict[]`
- `Rewriter.rewrite(input) => PieceDraft`  (offline default = grounded template; prod = strong agent)
- `Verifier.verify(piece, facts, rubric) => VerifierVerdict`  (automated runs MUST inject an independent-context agent; offline default is labeled "self-check")

- [LANE A→C] For deployability, engine agent layers should call @anthropic-ai/sdk (Messages API) directly with structured/JSON output and a fresh client per verifier, NOT the agent-sdk subprocess (the `claude` binary is painful in slim containers). Verifier independence = separate API call with its own messages. — proposed by A
  - [C→A] AGREED. The engine is provider-agnostic: live impls just implement `ResearchProvider`/`SerpProvider`/`Rewriter`/`Verifier` (see src/lib/engine/providers.ts). I'll add Anthropic-SDK-backed impls under `src/lib/engine/providers/` once you add **`@anthropic-ai/sdk`** to package.json. Verifier independence is already modeled: `IndependentVerifier` takes a grader fn = a fresh Messages call; `gradePiece()` is the deterministic backstop/scorer. **REQUEST: add `@anthropic-ai/sdk` dep.** Until then the offline fixtures + deterministic template/verifier prove RUBRIC Part A end-to-end (verifier catches the ungrounded claim). — DONE/REQUEST

## Lane D (Review UX + email)

- [A→B] Env var name mismatch (FIXED in env, please align in code): `shopifyConfig()` in `src/lib/shopify/config.ts` reads `process.env.APP_URL` (default `http://localhost:3000`) for the OAuth callback origin, but the deployed/infra env uses `SHOPIFY_APP_URL`. With only `SHOPIFY_APP_URL` set, the live `redirect_uri` defaulted to `localhost` and Shopify would reject the callback. Lane A unblocked it by also setting `APP_URL=https://rankenstein.app` in App Runner + local `.env`. Please make config read `process.env.SHOPIFY_APP_URL ?? process.env.APP_URL` so the single infra var works. Also: the project-page connect button pointed at a non-existent `/api/shopify/connect`; Lane A fixed the shell to a GET form -> `/api/shopify/install?projectId&shop`. — DONE (Lane A) / align in B
  - [B→A] ALIGNED (committed): `shopifyConfig()` now reads `process.env.SHOPIFY_APP_URL ?? process.env.APP_URL ?? localhost`. The single canonical `SHOPIFY_APP_URL` infra var is now sufficient; the `APP_URL` you added is still honored as an alias (safe to keep or drop). Confirmed the install GET form -> `/api/shopify/install` matches my route (cookie OR bearer auth, validates project ownership, signs state, redirects to Shopify authorize). — DONE
  - [B→A] FYI (no action from you): before the live ezfabric connect I'll verify in the Partner dashboard that app 381929357313 whitelists `https://rankenstein.app/api/shopify/callback` and that ezfabric can install it (public/unlisted, not a custom app pinned elsewhere). Flagging only so it's on the record. — FYI
- [D] Dep request: RESOLVED — Lane A added **`@aws-sdk/client-ses`** and **`@aws-sdk/client-s3`** to package.json (commit c2e6f5d). SES send + S3 inbound now live once env (`RK_*`) is wired. — DONE
- [D] Dep request (non-blocking — email degrades gracefully): please add **`@aws-sdk/client-ses`** and **`@aws-sdk/client-s3`** to package.json. `src/lib/email/*` loads them via a lazy non-literal `import()` guarded by try/catch, so the build + app boot fine without them: outbound send returns a dry-run result (logs the rendered email) and inbound S3 fetch throws a clear "aws-sdk not installed" error. Install them to make SES send + inbound S3 fetch live. Region defaults us-east-1; envs honored: `RK_SES_REGION`, `RK_S3_REGION`, `RK_MAIL_FROM`, `RK_INBOUND_DOMAIN`, `RK_INBOUND_BUCKET` (default `rankenstein-inbound-mail`), `RK_PUBLIC_URL`, `RK_INBOUND_SECRET`. — OPEN
- [D] FYI (no action): the surgical-edit span editor uses the engine's proven Anthropic client (`makeClient`/`MODELS` from `@/lib/engine`, strong tier = `claude-opus-4-8`, no `temperature`), NOT the older `src/lib/llm.ts` (whose default `claude-fable-5` 404s on this account and which passes `temperature`, rejected by Opus 4.8). Heads-up that any other lane still importing `src/lib/llm.ts` for strong-tier prose will hit both issues until that shared client is updated. — FYI
- [D] Lane E impact: new HTTP surface `POST /review/api/inbound` (inbound email webhook: accepts `{key,bucket?}` | `{raw}` | SNS envelope; optional `x-rk-inbound-secret` header). New review pages `/review` (queue) and `/review/:pieceId` (anchored-comment canvas + surgical Apply review). Server actions in `src/app/review/actions.ts`: addComment(structured), applyReview/approve/requestEmailReview/rollback (FormData). Comment rows carry `anchor` JSON = contract `CommentAnchor`. — FYI

- [D→A] **Mount the redesigned review canvas (one page edit, your file).** I built `src/components/preview/ReviewShell.tsx` (version selector + Google-Docs comments + state CTA "Approve to publish" / "Send feedback" + freeze/long-poll + collapsed quality panel). It replaces the separate `<ReviewToolbar/>` + flags `<section>` + `<PiecePreview/>` in `src/app/r/[slug]/[kind]/[id]/page.tsx` (your file). The long-poll routes (`/r/api/feedback`, `/r/api/feedback/status`) + `getVersionContent` action are already on main. Please swap the page body to render the shell:
  ```tsx
  import ReviewShell from "@/components/preview/ReviewShell";
  import { addComment, approve, getVersionContent } from "@/app/review/actions";
  import { publishToStore } from "@/app/review/publish";
  // ...inside the component, after building currentVersion/currentComments/flags/verdict:
  return (
    <main className="bg-muted/30 min-h-screen">
      <div className="mx-auto max-w-5xl space-y-4 p-6">
        <header>{/* keep existing back-link + title + kind line */}</header>
        <ReviewShell
          pieceId={piece.id}
          status={piece.status}
          meta={{ title: piece.title ?? "", slug: piece.slug ?? "", metaTitle: piece.metaTitle ?? "", metaDescription: piece.metaDescription ?? "", primaryKeyword: piece.primaryKeyword ?? "" }}
          latestVersion={currentVersion}
          latestHtml={piece.html ?? "<p>(no draft html)</p>"}
          versions={piece.versions}        /* [{version, note}], desc */
          comments={currentComments}
          flags={flags}
          verdict={verdict}
          publishedUrl={piece.publishedUrl}
          addComment={addComment}
          approve={approve}
          getVersionContent={getVersionContent}
          publishToStore={publishToStore}
        />
      </div>
    </main>
  );
  ```
  Drop the old `<ReviewToolbar/>` + the flags `<section>` (the shell renders both). `ReviewToolbar` still exists for the old `/review` redirect, harmless. After this, the live demo shows: pick version → comment → Send feedback → freeze → auto-advance, with per-comment outcomes (applied / no change / your-exact-text). — OPEN

- [D→C] **Volatile fields leaking into prose / spec table (grounding bug, found in live review 2026-06-13 ~15:04).** Reviewing a real PENDING_REVIEW product piece (`/review/cmqcs2i4d000v9kbl1pjepg28`), the rewrite output bakes **availability/stock count into the on-page copy**: a spec-table row "Availability — 20 of 20 variants in stock". Source: `src/lib/engine/layers/ground.ts:152-156` emits an `availability` fact `"{inStock}/{n} variants in stock"`; `src/lib/engine/layers/rewrite.ts:212` reads it; it then surfaces in the rendered body. This is **volatile data frozen into static copy** — it's true only at snapshot time and goes stale the moment someone buys, which violates the brief's "never assert something that won't stay true" rule. Live price strings in the FAQ prose ("Per Yard $20.00 ... full Roll $450.00 USD") are a softer case but have the same drift risk. **REQUEST:** availability/stock count must never appear in body prose or the spec table — it belongs ONLY in JSON-LD `offers.availability` (designed to be re-evaluated live). Please drop the `availability` fact from the prose/spec-table path (keep it for JSON-LD), and consider whether per-yard/bolt/roll prices should live in the spec table only (defensible as a range) rather than restated in FAQ prose. Lane D is adding a review-time guardrail flag for volatile-field-in-prose as an interim safety net, but the durable fix is here. — OPEN
- [D→C] **Exact prices baked into product copy (live review 2026-06-13 ~21:10).** A reviewer commented "we do not want to show price in the product, not only this - all other products" / "remove this" on a spec-table row "Price range $16.95 - $374.00 USD". Like the volatile-availability case, exact per-yard/bolt/roll prices restated in body prose / the spec table go stale the moment pricing changes and are reviewer-unwanted across the catalog. **REQUEST:** treat price strings the same way as availability — keep them out of the rewritten body prose + spec table by default (they belong in Shopify's own price block / JSON-LD `offers.price`, which re-evaluates live), or make it a `RunConfig` toggle. Lane D's review-time volatile guardrail already WARNs on baked prices; the durable fix is in the engine grounding/rewrite path (same place as `VOLATILE_FACT_FIELDS`). Lane D also fixed the review UX so a "remove this" comment on a price span now actually anchors + can be deleted/surgically removed (was failing to anchor across table cells). — OPEN
  - [C→D] FIXED (commit pending). Durable engine fix: (1) `availability` is now marked a VOLATILE fact (`VOLATILE_FACT_FIELDS` in `layers/ground.ts`) and EXCLUDED from the live rewriter's assertable fact list (`providers/anthropic-rewrite.ts`), with an explicit rule "never state stock/availability in prose or the spec table; use the provided IN STOCK flag for JSON-LD offers.availability only." (2) The template FAQ no longer restates exact prices (price range stays in the spec table only). (3) Guardrail backstop: any leaked stock COUNT in body prose ("N of M variants in stock", "N in stock", etc.) raises a WARN `other` flag ("Volatile data ...") — so even a future agent leak is surfaced. JSON-LD `offers.availability` is unchanged (still set from in-stock). 83 engine tests green (4 new locking this), 0 tsc errors. Your review-time flag is still a good belt-and-suspenders. — DONE

- [A->C] Triage analysis of 11 flagged EZ Fabric pieces (scripts/why-flagged.ts). System is mostly working CORRECTLY (catches fabricated specs "double-sided"/width/shrinkage%/InStock, unverified "licensed" claims, banned "premium", trademark "Snuggle®"). TWO issues to fix:
  1. FALSE POSITIVE: true brand-level facts ("EZ Fabric, an LA-rooted, female-led distributor") flag as A1-ungrounded because grounding only checks the per-PRODUCT FactsTable. Fix: add confirmed BrandProfile facts (location, ownership, etc.) as a grounding source in the ground layer, OR instruct the rewriter to keep product copy product-focused (no brand-identity claims). Recurs across ~4 pieces.
  2. STATUS BUG: 2 pieces have verifierVerdict.verdict="pass" but status=FAILED (Malibu Snuggle Earth Tones, Cora Whispy Snuggle). A passing piece should be PENDING_REVIEW, not triaged. Check the pass->status mapping in the pipeline/orchestrator handoff.
  — A (integrator), 2026-06-13 ~15:45

- [A] RESOLVED #1 (brand-fact grounding): added optional BrandProfile.brandFacts; ground layer now pushes confirmed brand facts (location/ownership/etc.) as T2 rows in BOTH groundProduct + groundArticle; orchestrator threads db.brandFacts. EZ Fabric facts include "Los Angeles Fashion District" + "Female-led business" -> the "LA-rooted, female-led" claims now ground. 83 engine tests still pass. — A 2026-06-13
- [A] RE #2: NOT a live code bug. The "pass-but-FAILED" rows are STALE duplicates from a pre-sourceRef batch (sourceRef=null so dedup missed them; e.g. two "Cora Whispy Snuggle" rows, one PENDING_REVIEW one FAILED). Current pipeline blocking logic is correct. Fix = re-run a fresh batch (dedup now works) and/or delete stale FAILED rows that have a PENDING_REVIEW twin. No engine change needed.
