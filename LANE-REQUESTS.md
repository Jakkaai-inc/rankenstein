# Lane requests

Cross-lane asks (new schema fields, shared types, npm deps). Lane A actions these.
Format: `- [LANE] request — status`

- [C] Toolchain: RESOLVED — picked up your vitest 4 + tsx + tsconfig (bundler resolution). Engine tests now use vitest API + extensionless imports; `npx vitest run src/lib/engine` is green. No deps needed from you. — DONE
- [C] Test runner choice: RESOLVED — standardized on vitest (your `npm test`). — DONE
- [C] Contracts: when you freeze `src/types/contracts.ts`, please adopt the shapes in `src/lib/engine/types.ts` (FactsTableRow/KeywordCandidate/PieceResult/RunConfig/VerifierVerdict/GuardrailFlag). I'll re-export from contracts and delete local dupes on "CONTRACTS FROZEN". — OPEN

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

