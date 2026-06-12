# Rankenstein — session bootstrap

This is the Claude Fable 5 Build Day project (2026-06-13). Before writing any code, read in order:

1. `inputs/BRIEF.md` — what we're building, for whom, and the P0/P1 tiers
2. `inputs/RUBRIC.md` — the machine-checkable definition of done; an independent verifier agent grades against it, and no tier is complete until its gates are green
3. `inputs/LAYER-CONTRACTS.md` — typed contracts for every pipeline stage
4. `inputs/reference-output-minky-preview.html` — structure the product-rewrite output must match

Ground rules for this build:

- Everything in `inputs/` is pre-event preparation; all product code is authored in-session today.
- Hard rules from the brief are non-negotiable: never invent facts; refuse-and-flag on missing grounding; no em dashes; nothing publishes without human approval; version snapshot before every store write.
- Deterministic logic (filters, gates, scoring, diffs) is plain code; agents only where judgment lives. Per-piece generation runs as a workflow with verifier-gated completion.
- Deploy targets already exist (provisioned pre-event, running throwaway smoke containers to be replaced): AWS App Runner (web, behind https://rankenstein.app), ECS Fargate (worker), RDS Postgres, ECR. Deploys are CLI one-liners; deploy early and often.
- Secrets are never committed. They are supplied via environment / untracked local files.
