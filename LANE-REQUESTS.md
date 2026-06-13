# Lane requests

Cross-lane asks (new schema fields, shared types, npm deps). Lane A actions these.
Format: `- [LANE] request — status`

- [C] Toolchain: RESOLVED — picked up your vitest 4 + tsx + tsconfig (bundler resolution). Engine tests now use vitest API + extensionless imports; `npx vitest run src/lib/engine` is green. No deps needed from you. — DONE
- [C] Test runner choice: RESOLVED — standardized on vitest (your `npm test`). — DONE
- [C] Contracts: DONE — adopted frozen `src/types/contracts.ts`. Engine re-exports shared types and flows `FactsRow[]` internally; 0 tsc errors. — DONE
- [C] Contract gap (non-blocking, nice-to-have): `ContentBrief` and `PieceResult` have no field for the **variant keyword→shade map**, which RUBRIC A6 + the reference preview require in the brief. Also `ContentBrief` lacks `gaps` and a per-secondary `volume/kd`/role. For now the engine returns a superset `EngineRunResult` (contract `PieceResult` + `.variantMap`, `.gaps`, `.aeo`, `.selection`, `.ground`) so nothing is lost; the canonical `result` field IS the contract `PieceResult`. If you want these first-class, add to `contracts.ts`: `ContentBrief.variantMap?: {keyword;volume;kd;variantValue}[]`, `ContentBrief.gaps?: string[]`, `PieceResult.variantMap?`. I'll switch to them when added. — OPEN
- [C] Verifier note: contract `VerifierVerdict.isSelfCheck` is honored. In automated runs the engine REQUIRES an injected independent-context verifier; a self-check verdict is returned but marked `isSelfCheck:true` and the piece status becomes `flagged` (never `pending_review`) unless an independent verifier passed it. Lane A/B: inject a fresh-context agent verifier via the `Verifier` interface for live runs. — FYI

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
