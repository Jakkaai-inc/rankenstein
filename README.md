# Rankenstein

**An autonomous, self-correcting content engine that never publishes without proof.**

Rankenstein researches keywords it can actually win (with SERP-ownership evidence), writes articles and product content grounded *only* in verifiable source data, structures everything for search engines and answer engines (AEO), grades its own output against a machine-checkable rubric with independent verifier agents, and ships only after a human approves — with version snapshots and one-click rollback on every publish.

Part of the [Jakka AI](https://www.jakka.ai) platform. Built for site owners and agencies.

## Status

🚧 **This repository is the Claude Fable 5 Build Day project (June 13, 2026).** All product code is being built during the event, in-session, by Claude Fable 5 running against the brief and rubric below.

- [`inputs/BRIEF.md`](inputs/BRIEF.md) — the build brief given to the model
- [`inputs/RUBRIC.md`](inputs/RUBRIC.md) — the machine-checkable definition of done (the model's verifier agents grade against this)
- [`inputs/LAYER-CONTRACTS.md`](inputs/LAYER-CONTRACTS.md) — typed contracts for every pipeline stage
- [`inputs/`](inputs/) — see its README for provenance (everything there predates the event)

## The loop (what makes this different)

1. **Ask first** — brand guidelines are drafted from a site crawl but a human confirms them; nothing generates from assumptions.
2. **Research first** — keyword choice requires SERP-ownership evidence (who owns the top 10, can *this* site win), with a native web-research fallback when no SEO provider is connected (`web-estimate` vs `provider-verified` confidence labels).
3. **Grounding discipline** — every claim traces to a source field; gaps are flagged, never guessed; trademarks and regulated claims are caught, not laundered.
4. **Independent verification** — a fresh-context verifier agent grades each piece against the rubric; failing pieces self-flag instead of shipping.
5. **Human-in-the-loop, surgically** — reviewers leave anchored comments (typed or spoken); the model edits *only* the commented spans, and a diff-verifier proves it.
6. **Reversible publishing** — version snapshot before every push; one-click rollback.

## License

MIT — see [LICENSE](LICENSE).
