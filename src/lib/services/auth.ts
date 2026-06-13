// Core session logic, transport-agnostic. The web app wraps issueSession in a
// signed cookie (src/lib/session.ts); the mobile/API layer returns the token as
// a bearer credential (src/lib/api/http.ts). Both resolve sessions through the
// same resolveSession, so there is one source of truth.
//
// NOTE (Phase 0): login is still "login-lite" — issueSession trusts the email
// with no verification, identical to the existing web login. Phase 0.5 adds an
// email OTP / magic-link challenge (needs a LoginChallenge model + migration)
// to harden this before real billing or multi-tenant launch.

import { randomBytes } from "crypto";

import { prisma } from "@/lib/db";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export type IssuedSession = {
  account: Awaited<ReturnType<typeof prisma.account.upsert>>;
  token: string;
  expiresAt: Date;
};

/** Upsert the account, mint a fresh session, return the bearer token. */
export async function issueSession(email: string, name?: string): Promise<IssuedSession> {
  const normalized = email.trim().toLowerCase();
  const account = await prisma.account.upsert({
    where: { email: normalized },
    create: { email: normalized, name },
    update: name ? { name } : {},
  });
  const token = randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + THIRTY_DAYS_MS);
  await prisma.session.create({
    data: { accountId: account.id, token, expiresAt },
  });
  return { account, token, expiresAt };
}

/** Resolve a session token (cookie value or bearer) to its account, or null. */
export async function resolveSession(token: string | null | undefined) {
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { token },
    include: { account: true },
  });
  if (!session || session.expiresAt < new Date()) return null;
  return session.account;
}

/** Revoke a single session (sign out). Idempotent. */
export async function revokeSession(token: string | null | undefined): Promise<void> {
  if (!token) return;
  await prisma.session.deleteMany({ where: { token } });
}

export const SESSION_TTL_MS = THIRTY_DAYS_MS;
