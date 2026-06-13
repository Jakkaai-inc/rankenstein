// Login-lite session: a signed cookie holding a Session token. Deliberately a
// thin seam — when Rankenstein migrates into Jakka, swap this for Jakka's auth.

import { cookies } from "next/headers";
import { randomBytes } from "crypto";

import { prisma } from "./db";

const COOKIE = "rk_session";
const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

export async function signIn(email: string, name?: string) {
  const account = await prisma.account.upsert({
    where: { email },
    create: { email, name },
    update: name ? { name } : {},
  });
  const token = randomBytes(24).toString("hex");
  await prisma.session.create({
    data: { accountId: account.id, token, expiresAt: new Date(Date.now() + THIRTY_DAYS) },
  });
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: THIRTY_DAYS / 1000,
    path: "/",
  });
  return account;
}

export async function signOut() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await prisma.session.deleteMany({ where: { token } });
  jar.delete(COOKIE);
}

export async function getAccount() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { token },
    include: { account: true },
  });
  if (!session || session.expiresAt < new Date()) return null;
  return session.account;
}

export async function requireAccount() {
  const account = await getAccount();
  if (!account) throw new Error("UNAUTHENTICATED");
  return account;
}
