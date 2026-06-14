# Rankenstein — Decisions log (brainstorm channel)

Append-only. Each entry = one locked decision from the brainstorm chat.
Lanes are notified by pasted prompt, not by reading this file. Newest at top.

## D-002 — Canonical design system = shadcn/ui + radix-luma (2026-06-13)
**Decision:** The shared visual direction is NOT invented here — it already exists. The app's
canonical UI system is the shadcn/ui primitives in `src/components/ui/*` + the radix-luma oklch
tokens in `src/app/globals.css` + Inter, already adopted by Lane A across `src/app/p/[slug]/*`.
All UI lanes conform to it. Lane D reskins its remaining surfaces (ReviewShell, PiecePreview,
review queue + per-piece pages) to this system, reusing the existing primitives/tokens (no new
primitives, no hardcoded colors/fonts); the rendered piece-HTML preview keeps matching
`inputs/reference-output-minky-preview.html` (reskin the review CHROME, not the generated
content). Lane A's shell polish stays queued behind gate #8 (live publish+rollback). Lane E
mirrors the same tokens later.
**Affects:** Lane D (reskin now — only `ReviewToolbar.tsx` was on shadcn), Lane A (already there;
queued), Lane E (later).
**Status:** injected — paste prompt for the existing Lane D chat emitted.

## D-001 — Lane E = Mobile app (2026-06-13)
**Decision:** A separate chat builds the mobile app; it is registered as **Lane E**.
Code location TBD. Lane E depends on four backend surfaces: the HTTP API (App Runner web
routes + JSON shapes), the frozen TS contracts (`src/types/contracts.ts`), the auth/session
model (`src/lib/session.ts`), and the review/publish flow (Lane D review UX + Lane B publish).
Sync is paste-prompt driven both ways: backend changes to any of those surfaces are injected
into Lane E via Gev; Lane E's needs are filed through Gev / `LANE-REQUESTS.md`, with contract
changes still gating through Lane A. Nothing publishes without human approval (brief rule).
**Affects:** Lane A (register + maintain board line while location is TBD); Lanes B/C/D
(learn of E via PARALLEL-LANES.md on next read, or an optional FYI paste); new Lane E.
**Status:** injected — Lane A registration prompt + Lane E identity prompt emitted to Gev.

## D-000 — Brainstorm chat operating convention (2026-06-13)
**Decision:** This chat is the brainstorm/decision channel. Decisions are logged here
and injected into lanes via copy-paste prompts only; this chat never edits lane-owned
files (PARALLEL-LANES.md, LANE-REQUESTS.md, src/**).
**Affects:** workflow (all lanes)
**Status:** active
