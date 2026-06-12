# inputs/ — pre-event provenance

Everything in this directory was prepared **before** the Claude Fable 5 Build Day (written 2026-06-12; the event is 2026-06-13). It exists so judges can clearly distinguish pre-event inputs from event-built code:

- `BRIEF.md` — the build brief handed to the model at kickoff
- `RUBRIC.md` — the machine-checkable definition of done
- `LAYER-CONTRACTS.md` — typed contracts for the pipeline stages the model implements
- `aeo-optimization-skill/` — the AEO (Answer Engine Optimization) framework the content layers apply
- `reference-output-minky-preview.html` — a hand-validated reference product rewrite (EZ Fabric) the engine's output must structurally match
- `ez-fabric-catalog-snapshot.json` (added Friday if present) — export of already-public storefront product data; grounding source + rollback insurance

**Everything outside `inputs/` is built during the event, in-session, by Claude Fable 5.** The session log and workflow scripts are part of the submission.
