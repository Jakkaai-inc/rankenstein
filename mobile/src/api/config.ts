import Constants from "expo-constants";

// Resolution order:
//   1. EXPO_PUBLIC_API_BASE env var (set per-run, e.g. your laptop LAN IP)
//   2. app.json -> expo.extra.apiBase (the deployed default)
//   3. localhost fallback (simulator only)
const fromExtra = (Constants.expoConfig?.extra as { apiBase?: string } | undefined)?.apiBase;

export const API_BASE: string =
  process.env.EXPO_PUBLIC_API_BASE ?? fromExtra ?? "http://localhost:3000";
