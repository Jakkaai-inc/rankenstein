// Flexible auth for the /api/shopify routes (Lane B). These routes serve BOTH
// the web app (rk_session cookie) and the Lane E mobile client (Bearer token),
// so they resolve an account from either credential. Both flow through the same
// resolveSession, so there is one source of truth (matches src/lib/api/http.ts
// for bearer and src/lib/session.ts for the cookie).

import { type NextRequest } from "next/server";

import { resolveSession } from "@/lib/services/auth";
import { UnauthenticatedError } from "@/lib/services/errors";

const COOKIE = "rk_session";

function bearerToken(req: NextRequest): string | null {
  const header = req.headers.get("authorization");
  if (!header) return null;
  const [scheme, token] = header.split(" ");
  return scheme?.toLowerCase() === "bearer" && token ? token.trim() : null;
}

/** Resolve a Bearer token or the rk_session cookie to an account, or null. */
export async function getAccountFlexible(req: NextRequest) {
  const token = bearerToken(req) ?? req.cookies.get(COOKIE)?.value ?? null;
  return resolveSession(token);
}

/** Throwing variant for routes that require auth (web cookie or mobile bearer). */
export async function requireAccountFlexible(req: NextRequest) {
  const account = await getAccountFlexible(req);
  if (!account) throw new UnauthenticatedError();
  return account;
}
