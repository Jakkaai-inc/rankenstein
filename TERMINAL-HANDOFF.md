# Terminal handoff — move all lanes to Claude Code on event API billing

The lanes were running as claude.ai chats. We are moving each to a terminal
Claude Code session billed to the **event $500 API credits** (not claude.ai).
All code is in this repo; nothing to "move" but context + billing.

## A. Launch a lane on event API billing (every lane does this)

```bash
export ANTHROPIC_API_KEY="sk-ant-...EVENT-CREDITS-KEY..."   # from #credit-questions
cd /Users/gevbalyan/Claude/rankenstein
git pull
claude
```
Inside Claude Code: run `/status` and confirm it shows the **API key / event org**.
If it shows a claude.ai subscription instead, run `/login` and pick **API key**.

## B. Running several sessions at once — avoid collisions

All lanes share ONE working tree, so multiple `claude` sessions editing it at once
can stomp each other (git index locks, uncommitted-file clobber). Two safe options:

- **Simple (works if lanes touch disjoint folders):** one session per lane, each
  edits only its own folder, commit small + often with **targeted `git add <files>`**
  (NEVER `git add -A`), and `git -c rebase.autoStash=true pull --rebase` before push.
- **Cleanest (true isolation):** give each lane its own working dir via a worktree:
  ```bash
  git worktree add ../rk-lane-b -b lane-b   # then: cd ../rk-lane-b && claude
  ```
  Each lane commits on its branch; the integrator merges branches to main.

## C. Current state (2026-06-13 afternoon)

- Lane A (foundation/integrator): DONE app shell, auth, brand flow, run
  orchestrator, deploy pipeline, GOAL.md grader. Live: rankenstein.app.
- Lane C (engine): ADVANCED — product + article pipelines, live Anthropic
  providers, verifier; all committed under `src/lib/engine/*`.
- Services + mobile + /api/v1: committed (`src/lib/services`, `src/app/api/v1`, `mobile/`).
- **Lane B (Shopify): NO CODE YET** — `src/lib/shopify`, `src/app/api/shopify` absent.
- **Lane D (Review UI): NO CODE YET** — `src/app/review`, `src/components/preview`,
  `src/lib/email` absent.
- Both are demo-critical (live publish + review/voice). Prioritize.

Secrets/infra endpoints: `/Users/gevbalyan/Claude/rankenstein-infra.local.md`
(untracked — never commit). RDS SG open to 0.0.0.0/0 for the day (teardown after).

## D. Per-lane resume prompts (paste after launching claude)

### Lane A — Foundation + Integrator
> You are Lane A. `git pull`. Read CLAUDE.md, PARALLEL-LANES.md (the "Lane A STATE"
> line), GOAL.md. Next: (1) rebuild+redeploy current code (git archive HEAD -> s3
> rankenstein-build-src-ue2 -> `aws codebuild start-build --region us-east-2
> --project-name rankenstein-web`; autodeploy rolls :latest); verify
> `npx tsx scripts/goal-check.ts`. (2) `npx tsx scripts/seed-and-run.ts 10` to fill
> the review queue. (3) integrate Lane B + D. (4) live publish to ezfabricinc.com +
> rollback. Targeted commits only; add `Lane E impact:` notes on API/contract/auth changes.

### Lane B — Shopify connector (URGENT: no code yet)
> You are Lane B. `git pull`. Read PARALLEL-LANES.md + src/types/contracts.ts +
> prisma/schema.prisma (ShopifyConnection, Page, ContentItem, ContentVersion).
> App is NON-embedded: app id 381929357313, client_id d48c54d3fc2b77ee8f32883932bb7451,
> secret SHOPIFY_API_SECRET in the infra file, scopes read/write products+content,
> callback https://rankenstein.app/api/shopify/callback (+localhost). Build
> `src/lib/shopify/*` + `src/app/api/shopify/*` ONLY: OAuth connect->callback->store
> offline token on ShopifyConnection; catalog sync->Page rows; PUBLISH (article +
> product update) writing a ContentVersion snapshot BEFORE each push; one-click
> rollback from snapshot. This unblocks the live-publish demo gate. Targeted commits;
> add `Lane E impact:` if you add API routes the mobile app would call.

### Lane C — Engine
> You are Lane C. `git pull`. Continue `src/lib/engine/*` ONLY. Product path is
> validated (2/2 pass, real fabric keywords). Finish the article path + keep tuning
> the live rewriter/verifier so pieces PASS not just flag. Keep `npx tsx
> src/lib/engine/selfcheck.ts` green. Targeted commits.

### Lane D — Review UX + email (URGENT: no code yet)
> You are Lane D. `git pull`. Read PARALLEL-LANES.md + src/types/contracts.ts
> (ReviewComment, CommentAnchor, FeedbackSet, SurgicalEditResult) + schema
> (ContentItem, Comment, ContentVersion). Build `src/app/review/*` +
> `src/components/preview/*` + `src/lib/email/*` ONLY: preview template rendering a
> piece; anchored comments (pinned field + select-span->type + select-span->voice via
> Web Speech API) -> Comment rows; surgical-edit + span-diff-verify review workflow
> (only commented spans may change); SES send ("Pending review") + inbound parse from
> s3 rankenstein-inbound-mail (us-east-1) for reply-feedback/"I approve". There are
> already PENDING_REVIEW pieces in the DB to render. This is the demo's wow. Targeted commits.

### Lane E — Mobile (Expo iOS)
> You are Lane E. `git pull`. You own the mobile client (`mobile/`). Consume the
> backend HTTP API (`/api/v1/*`) + frozen contracts (src/types/contracts.ts) + the
> review/publish flow. Edit no backend source. If an API/contract you need is missing
> or changed, ask Gev to relay to Lane A. Targeted commits to `mobile/` only.

### Services/API lane
> You own `src/lib/services/*`, `src/lib/api/*`, `src/app/api/v1/*`. Keep web actions
> + mobile API on one shared service layer. Any new/changed route or payload: add a
> `Lane E impact:` line so the mobile lane stays in sync. Targeted commits.
