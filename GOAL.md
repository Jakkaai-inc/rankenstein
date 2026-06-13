# GOAL — Rankenstein Build Day (the hillclimb target)

> The single target this build steers toward. "Done" is machine-verifiable:
> run `npx tsx scripts/goal-check.ts` to grade it. The model hillclimbs until
> the score is N/N. This file + the checker are the Orchestration artifacts.

## The goal

A live, deployed Rankenstein at **https://rankenstein.app** that takes the real
EZ Fabric store from connect → grounded content → human review → live publish,
fully autonomously between the human checkpoints, by 17:00.

## Verifiable success criteria (graded by scripts/goal-check.ts)

1. **Deployed app** — `https://rankenstein.app/` returns 200 and serves the real
   app (contains the Rankenstein landing copy, not the smoke page).
2. **Auth guard** — `/projects` redirects an unauthenticated request to sign-in
   (3xx), never a 500.
3. **Database** — RDS reachable; the EZ Fabric project exists with a CONFIRMED
   brand profile (generation is blocked until confirmed).
4. **Engine tests** — the engine test suite passes (`vitest run src/lib/engine`).
5. **Grounding proof** — the engine self-check shows the verifier PASSING a
   grounded rewrite and CATCHING a naive rewriter's fabricated claims
   (`src/lib/engine/selfcheck.ts`).
6. **Review queue** — at least 5 product pieces exist in PENDING_REVIEW for the
   EZ Fabric project (a real catalog batch ran into the queue).
7. **Review loop** — an anchored comment on a piece produces a surgical edit that
   changes only the commented span (Lane D span-diff verifier confirms).
8. **Live publish + rollback** — at least one approved piece is published to
   ezfabricinc.com and a version snapshot exists enabling one-click rollback.

## Human checkpoints (the ONLY allowed interventions — Autonomy story)

- Brief the model (this repo's inputs/).
- Enter secrets (never typed by the model).
- The review/approve gate (the product IS this gate).
- Direct the demo.

Everything else self-corrects via the engine's fresh-context verifier and the
goal-check loop. Interventions are new information, not steering.

## Out of scope for the goal (post-event)

Billing, BrightLocal, scheduling/cron, the article path at scale, the Phase-2
measurement + content-lifecycle loop.
