// GET /api/v1/me -> { account }  (also surfaces the read-only credits balance)

import { type NextRequest } from "next/server";

import { handle, json, requireAccount } from "@/lib/api/http";
import { publicAccount } from "@/lib/api/serializers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return handle(async () => {
    const account = await requireAccount(req);
    return json({ account: publicAccount(account) });
  });
}
