# GOAL — Lane E (Mobile) — Fable 5 Build Day

> The target for THIS chat. **Deadline: 2026-06-13, 17:00 (5pm).**
> Subordinate to the project-wide `../GOAL.md`; this is the mobile slice of it.
> "Working app" = runs on the iOS Simulator and drives the spine against the
> LIVE backend, not a skeleton that only typechecks.

## The goal

A working **React Native (Expo) app on iOS** that signs in against the live
Rankenstein backend and drives the project spine end to end, demoable by 17:00.

## P0 — must demo (proof it's a real working iOS app)

1. **Boots on iOS Simulator** — `npx expo start` → open iOS, no redbox.
2. **Sign in** — email → bearer token in SecureStore → lands on Projects.
3. **Live list** — Projects list loads from the deployed `/api/v1` (real RDS data).
4. **Create** — create a project from the phone; it persists and opens detail.
5. **Detail** — project detail shows the real onboarding gate (Shopify/brand) + run activity.
6. **Persistence** — kill + relaunch the app; still signed in.

## P1 — stretch (only if P0 lands before 17:00)

7. **Brand** — draft-from-site + confirm (the ask-first gate) from the app.
8. **Run monitor** — a run's done/total/flagged/spend refreshes on pull-to-refresh.

## Critical path (hard dependencies, in order)

1. **Deploy Phase 0 API routes** so `/api/v1` is live with DB access — the laptop
   can't reach RDS (`P1001`), but App Runner can. Rides the normal web deploy. **← gating**
2. `cd mobile && npm install` (then `npx expo install --fix` if the SDK matrix complains).
3. **iOS Simulator available** (Xcode installed); boot the app via Expo.
4. App points at `https://rankenstein.app` (already set in `app.json` → `extra.apiBase`).

## Verification

- **Auto:** `mobile` typecheck passes; deployed `GET /api/v1/me` returns `401`
  (proves the API is live), `POST /api/v1/auth/login` returns a token.
- **Human (on the Simulator):** the six P0 steps; capture a short screen clip for the demo.

## Explicitly NOT in the 5pm goal

Full web parity, the review/approve hero flow, voice comments, push notifications,
billing, Shopify OAuth from mobile, App Store submission. Those are the post-5pm arc.
