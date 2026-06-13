// Web session: a signed httpOnly cookie wrapping the same Session token the
// mobile/API layer hands out as a bearer. The core (issue/resolve/revoke) lives
// in services/auth.ts so web and API share one source of truth. When Rankenstein
// migrates into Jakka, swap this cookie seam for Jakka's auth.

import { cookies } from "next/headers";

import { issueSession, resolveSession, revokeSession, SESSION_TTL_MS } from "./services/auth";

const COOKIE = "rk_session";

export async function signIn(email: string, name?: string) {
  const { account, token } = await issueSession(email, name);
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_TTL_MS / 1000,
    path: "/",
  });
  return account;
}

export async function signOut() {
  const jar = await cookies();
  await revokeSession(jar.get(COOKIE)?.value);
  jar.delete(COOKIE);
}

export async function getAccount() {
  const jar = await cookies();
  return resolveSession(jar.get(COOKIE)?.value);
}

export async function requireAccount() {
  const account = await getAccount();
  if (!account) throw new Error("UNAUTHENTICATED");
  return account;
}
