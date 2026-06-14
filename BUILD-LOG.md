# Rankenstein — Build Day log (orchestration narrative)

> A hand-authored log of how Claude (Opus 4.8, 1M context) was orchestrated to build
> Rankenstein on Build Day (2026-06-13). The raw `/export` transcript is intentionally
> NOT committed — it contains live API keys / Shopify tokens / DB creds and this is a
> public repo. This curated, secret-free narrative is the session log; the repo is the
> real artifact. Orchestration files: [CLAUDE.md](CLAUDE.md),
> [PARALLEL-LANES.md](PARALLEL-LANES.md), [GOAL.md](GOAL.md),
> [scripts/goal-check.ts](scripts/goal-check.ts), [inputs/BRIEF.md](inputs/BRIEF.md),
> [inputs/RUBRIC.md](inputs/RUBRIC.md), [inputs/LAYER-CONTRACTS.md](inputs/LAYER-CONTRACTS.md).

## Strategy in one line
Frozen contracts + parallel Claude Code lanes + a machine-checkable hillclimb, with an
independent fresh-context verifier gating quality and a human gating publish.

## How Claude's work was orchestrated

1. **Bootstrap (CLAUDE.md).** Every session reads, in order: brief → rubric → typed layer
   contracts → reference output. Hard rules are non-negotiable and enforced in code:
   never invent facts; refuse-and-flag on missing grounding; no em dashes; nothing
   publishes without human approval; version-snapshot before every store write.

2. **Parallel lanes (PARALLEL-LANES.md).** ~5 Claude Code sessions ran against one repo,
   each owning disjoint folders to avoid collisions:
   - Lane A — foundation, app shell, deploy pipeline, integrator.
   - Lane B — Shopify connector (OAuth, sync, publish + snapshot + rollback).
   - Lane C — the engine (ground → research → filter → serp-ownership → select → rewrite
     → aeo → guardrails → gates → verify) + fresh-context verifier.
   - Lane D — review UX (anchored comments, surgical edit + span-diff) + email.
   - Lane E — Expo mobile client.
   A "CONTRACTS FROZEN" gate blocked all lanes until `prisma/schema.prisma` +
   `src/types/contracts.ts` were pushed. Targeted small commits, `pull --rebase` before
   push, `Lane E impact:` notes on any API/contract/auth change.

3. **Verifier-gated hillclimb (GOAL.md + scripts/goal-check.ts).** A machine-checkable
   definition of done (deployed app, auth guard, confirmed brand, grounded review queue,
   live publish + rollback). The model ran `goal-check.ts` and self-corrected until the
   score climbed (2/5 → 4/5 live).

4. **Agents only where judgment lives.** Filters, gates, SERP-ownership scoring, span
   diffs, version snapshots, and dedup are deterministic plain code. Opus 4.8 agents
   handle research, brand-voice drafting, the **independent fresh-context verifier**
   (a separate Anthropic call that grades each piece against the rubric — two failures
   self-flag it for human triage), the **surgical span editor** (rewrites only the
   commented span, then a deterministic token diff proves nothing else changed), and the
   **AI content-calendar planner**.

## Milestones (chronological)
- Scaffold + frozen schema/contracts + deployed skeleton (CodeBuild → ECR → App Runner).
- Engine: full product-rewrite pipeline; the verifier catches fabricated GSM/certs/reviews
  on a naive rewriter (`src/lib/engine/selfcheck.ts`).
- Run orchestrator: catalog → engine → review queue, dedup, spend stop, triage.
- Live deploy validated; auth guard fixed (goal-check #2 500 → 307).
- Seeded the EZ Fabric review queue (15+ PENDING_REVIEW; the verifier held back ungrounded
  pieces as FAILED/triage).
- Lane B + D integration: live Publish + Rollback wired into the review UI.
- Connected the **real EZ Fabric Shopify store** (custom-app OAuth, local token exchange
  to work around cross-org install limits) and synced **903 products**.
- shadcn/ui rebuild of the whole app on a custom preset theme.
- URL restructure to slugged routes: `/p/[slug]/{overview,review,products,articles,settings}`
  and `/r/[slug]/[kind]/[id]`; marketing on the apex, app moving to `studio.`.
- First-run intent popup → AI-generated **content calendar** of planned articles.

## Hard rules that shaped the product
- **Refuse-and-flag beats degrade-and-guess.** Missing a spec? Flag it; never fabricate.
- **Snapshot before every write**, so every publish and edit is reversible.
- **Human gates publish; the verifier gates quality.** Autonomy lives only between those
  two checkpoints.
