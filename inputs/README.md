# inputs/ — pre-event provenance

Everything in this directory was prepared **before** the Claude Fable 5 Build Day (written 2026-06-12; the event is 2026-06-13). It exists so judges can clearly distinguish pre-event inputs from event-built code:

- `BRIEF.md` — the build brief handed to the model at kickoff
- `RUBRIC.md` — the machine-checkable definition of done
- `LAYER-CONTRACTS.md` — typed contracts for the pipeline stages the model implements
- `aeo-optimization-skill/` — the AEO (Answer Engine Optimization) framework the content layers apply
- `reference-output-minky-preview.html` — a hand-validated reference product rewrite (EZ Fabric) the engine's output must structurally match
- `ez-fabric-catalog-snapshot.json` (added Friday if present) — export of already-public storefront product data; grounding source + rollback insurance

**Everything outside `inputs/` is built during the event, in-session, by Claude Fable 5.** The session log and workflow scripts are part of the submission.

Infrastructure note: AWS resources (empty App Runner/ECS services, an empty database, DNS) were provisioned before the event carrying throwaway hello-world smoke containers; all application code replacing them is event-built. An earlier private prototype interface (built days before the event for quick testing) was retired and removed before the event — none of its code is used here; the application is built from scratch against the brief, rubric, and layer contracts in this directory.
