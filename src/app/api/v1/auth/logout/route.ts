// POST /api/v1/auth/logout -> { ok: true }  (revokes the bearer session)

import { type NextRequest } from "next/server";

import { bearerToken, handle, json } from "@/lib/api/http";
import { revokeSession } from "@/lib/services/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  return handle(async () => {
    await revokeSession(bearerToken(req));
    return json({ ok: true });
  });
}
