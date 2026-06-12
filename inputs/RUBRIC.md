# Rankenstein — Qualification Rubric

> Machine-checkable. The engine's verifier agent grades every piece against Part A in a fresh context; the build's verifier grades the system against Part B before any tier is declared done. A piece/tier passes only when EVERY gate is green or explicitly flagged-and-excused by a human.

## Part A — per-piece gates (article or product rewrite)

### A1. Grounding (blocking)
- [ ] Every factual claim (material, dimension, price, care, cert, stat) traces to a named field in the source data (catalog snapshot / live product / cited URL). The verifier must list each claim → source pair, with the FactsTable trust tier (T1 structured / T2 merchant-stated spec lines / T3 unverified prose — T3 may never be asserted, only flagged).
- [ ] Zero invented specs, certifications, awards, review counts, or numbers.
- [ ] Data gaps are flagged (e.g. "GSM missing — ask merchant"), never filled by guess.
- [ ] For articles: every external claim carries an inline link with descriptive anchor text; each cited URL loads (2xx) and actually supports the claim. Financial/legal/health claims cite only high-authority sources.

### A2. AEO structure (blocking)
- [ ] Lead passes the three-sentence test: who is it for / what problem / how different.
- [ ] At least one fact, number, or named system unique to this brand (the "could a competitor copy-paste this?" test fails for them).
- [ ] FAQ present with real buyer questions answered directly in 2–4 sentences.
- [ ] Product rewrites: extractable spec table + "who it's for" framing, matching `reference-output-minky-preview.html` structure.
- [ ] One-paragraph test: an LLM could summarize the page in one accurate paragraph.

### A3. Structured data & meta (blocking)
- [ ] JSON-LD parses (`Article`+`FAQPage` for articles; `Product` for rewrites); `priceCurrency` from store settings, never assumed.
- [ ] No `aggregateRating` or review fields unless real review data exists in source.
- [ ] Meta title 50–60 chars (hard cap 62) with primary keyword near the front; meta description ≤ 155 chars; slug ≤ 5 words. (Known deviation: the pre-event reference preview's title is 62 chars — at the cap, not the target.)

### A4. Brand voice (blocking)
- [ ] Zero em dashes. Zero emojis in headings. Zero banned words (per project's confirmed brand profile).
- [ ] No trademark-as-generic usage (e.g. "Cuddle®" as a product type); trademark-adjacent targeting is flagged for human sign-off.
- [ ] Tone: one honest peer among competitors; specificity persuades, never hard-sell.

### A5. Keyword discipline (blocking)
- [ ] Primary keyword chosen from researched candidates with SERP-ownership evidence (who owns the top 10, winnability for THIS site's authority), tagged `provider-verified` or `web-estimate`.
- [ ] Product rewrites: only product-defining + variant terms — head/category terms are excluded BY RULE (they belong to collections); sibling-SKU terms routed away (cannibalization exclusion list present in the brief output).
- [ ] Articles: keyword not already covered by existing content at the same intent (else refresh recommendation, not a duplicate).

### A6. Process honesty (blocking)
- [ ] The piece's content brief reports: keyword data source + confidence tag, SERP owner note, word target vs computed count (product target: 250-500 body words; article target: derived at outline), guardrail flags, verifier verdict (an independent-context verdict in automated runs; "self-check" labels never pass).
- [ ] If the verifier failed the piece twice → status is self-flagged for human triage, NOT silently shipped or endlessly retried.

## Part B — run-level gates (the system itself)

- [ ] Unit tests green (engine gates, anchor mapping, surgical-diff checker).
- [ ] Deployed URL (rankenstein.app) returns 200 and serves the app.
- [ ] Shopify OAuth round-trip completes on the real store; token scopes verified.
- [ ] Brand guidelines flow: crawl → draft → human confirm; generation provably blocked pre-confirmation.
- [ ] Canary: ONE product published live, verified visible on the storefront, then rolled back from the version snapshot, verified restored.
- [ ] Anchored-comment loop: a comment on span X produces a diff that touches ONLY span X's content (verifier diffs the before/after and confirms no other section changed).
- [ ] Voice comment: speech input lands as an anchored comment with correct span anchor.
- [ ] Email: "Pending review" notification delivered; (P1) inbound reply ingested as feedback; "I approve"-style reply flips status.
- [ ] Bulk run: whole catalog processed priority-first with per-piece token ceiling, global spend soft-stop, and triage flags visible in the queue.
- [ ] Rollback exists for every published piece (version snapshot saved BEFORE each push).

## Part C — demo gates (before 17:00)

- [ ] 1-minute video recorded showing: autonomous run → a verifier catching an ungrounded claim → voice comment → surgical edit → live publish on ezfabricinc.com.
- [ ] Repo public under Jakkaai-inc, MIT, with inputs/ provenance labels intact.
- [ ] Session log + workflow scripts exported as submission artifacts.
- [ ] Submission form completed before 17:00.
