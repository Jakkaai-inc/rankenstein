// POST /api/v1/auth/login  { email, name? } -> { token, expiresAt, account }
// Phase 0 "login-lite" (no verification yet — see services/auth.ts). The token
// is a bearer credential the mobile app stores in SecureStore.

import { type NextRequest } from "next/server";
import { z } from "zod";

import { handle, json, readJson } from "@/lib/api/http";
import { publicAccount } from "@/lib/api/serializers";
import { issueSession } from "@/lib/services/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  email: z.string().regex(/^[^@\s]+@[^@\s]+\.[^@\s]+$/, "valid email required"),
  name: z.string().trim().min(1).optional(),
});

export async function POST(req: NextRequest) {
  return handle(async () => {
    const { email, name } = Body.parse(await readJson(req));
    const { account, token, expiresAt } = await issueSession(email, name);
    return json({ token, expiresAt: expiresAt.toISOString(), account: publicAccount(account) });
  });
}
