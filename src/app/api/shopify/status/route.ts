// GET /api/shopify/status?projectId=X
//   -> { connected, shopDomain?, scopes?, currency?, locale?, primaryDomain?, blogConfigured, installedAt? }
// Connection status for a project (never returns the access token). Cookie or
// bearer auth. Lane E reads this to drive the connect/publish UI.

import { type NextRequest } from "next/server";

import { handle, json } from "@/lib/api/http";
import { prisma } from "@/lib/db";
import { getConnection, requireAccountFlexible } from "@/lib/shopify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return handle(async () => {
    const account = await requireAccountFlexible(req);
    const projectId = new URL(req.url).searchParams.get("projectId");
    if (!projectId) return json({ error: "projectId required" }, 400);

    const project = await prisma.project.findFirst({ where: { id: projectId, accountId: account.id }, select: { id: true } });
    if (!project) return json({ error: "project not found" }, 404);

    const conn = await getConnection(projectId);
    if (!conn) return json({ connected: false, blogConfigured: false });
    return json({
      connected: !!conn.accessToken,
      shopDomain: conn.shopDomain,
      scopes: conn.scopes,
      currency: conn.currency,
      locale: conn.locale,
      primaryDomain: conn.primaryDomain,
      blogConfigured: !!conn.blogId,
      installedAt: conn.installedAt.toISOString(),
    });
  });
}
