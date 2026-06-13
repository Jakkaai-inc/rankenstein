# Rankenstein Mobile (Expo)

Native iOS/Android client for Rankenstein. Phase 0 ships the **seam**: sign in,
list/create projects, and view a project's onboarding gate + run activity —
all against the `/api/v1` bearer-authed API in the main Next app.

## Stack

- **Expo SDK 52** + **expo-router** (file-based routing)
- **expo-secure-store** for the bearer token
- Typed API client in `src/api/` (mirrors the server serializers)

## Run it

```bash
cd mobile
npm install
# if the dependency matrix complains, align native versions to your installed SDK:
npx expo install --fix

# point at your backend (see .env.example); default is https://rankenstein.app
cp .env.example .env   # edit EXPO_PUBLIC_API_BASE if running the API locally

npx expo start         # press i (iOS sim), a (Android), or scan in Expo Go
```

Local backend, physical device: set `EXPO_PUBLIC_API_BASE` to your machine's LAN
IP (e.g. `http://192.168.1.20:3000`), not `localhost`.

## Layout

```
app/                       expo-router routes
  _layout.tsx              hydrates the saved token, defines the stack
  index.tsx                login (email -> bearer token)
  projects/index.tsx       project list + create
  projects/[id].tsx        project detail: gate steps + brand + run activity
src/api/
  client.ts                typed fetch client (api.login, api.listProjects, ...)
  types.ts                 wire types — keep in sync with src/lib/api/serializers.ts
  storage.ts               SecureStore token helpers
  config.ts                API base resolution
```

## What's stubbed / next (per the Phase plan)

- **Auth** is "login-lite" (email only, no verification) — matches the current
  web login. **Phase 0.5**: email OTP / magic-link (server needs a
  `LoginChallenge` model + migration), then real auth before billing.
- **Phase 1**: run monitoring polling, read-only billing, push notifications
  (server needs a `Device` model for Expo push tokens).
- **Phase 2**: brand draft/confirm screens, Shopify OAuth via in-app browser,
  configure + start runs.
- **Phase 3**: the review hero — piece preview (WebView), anchored + voice
  comments, surgical revision, approve / publish / rollback.

The API endpoints for brand draft/confirm already exist
(`POST /api/v1/projects/:id/brand/{draft,confirm}`); the screens just aren't
wired yet.
