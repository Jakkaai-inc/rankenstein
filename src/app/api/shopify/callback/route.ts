// GET /api/shopify/callback?code=&hmac=&shop=&state=&timestamp=
// Shopify redirects here after the merchant approves. No session: we trust the
// request HMAC (proves it came from Shopify) + our signed state (carries the
// projectId). Exchanges the code for an OFFLINE token, fetches store context,
// persists the ShopifyConnection, then redirects back into the app.

import { NextResponse, type NextRequest } from "next/server";

import { prisma } from "@/lib/db";
import {
  adminClient,
  exchangeCodeForToken,
  fetchShopContext,
  normalizeShopDomain,
  saveConnection,
  shopifyConfig,
  verifyCallbackHmac,
  verifyState,
} from "@/lib/shopify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function back(projectId: string | null, status: string): NextResponse {
  const { appUrl } = shopifyConfig();
  const dest = projectId ? `${appUrl}/projects/${projectId}?shopify=${status}` : `${appUrl}/?shopify=${status}`;
  return NextResponse.redirect(dest);
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const params = url.searchParams;

  // 1. authenticity: request HMAC + signed state.
  if (!verifyCallbackHmac(params)) return back(null, "hmac_failed");
  const state = verifyState(params.get("state"));
  if (!state) return back(null, "state_failed");

  const shop = normalizeShopDomain(params.get("shop"));
  const code = params.get("code");
  if (!shop || !code) return back(state.projectId, "bad_request");

  // 2. the project must still exist (state is signed, but be defensive).
  const project = await prisma.project.findUnique({ where: { id: state.projectId }, select: { id: true } });
  if (!project) return back(null, "project_missing");

  try {
    // 3. exchange code -> offline token, fetch store context, persist.
    const { access_token, scope } = await exchangeCodeForToken(shop, code);
    const client = adminClient(shop, access_token);
    const context = await fetchShopContext(client);
    await saveConnection({ projectId: state.projectId, shopDomain: shop, accessToken: access_token, scopes: scope, context });
    return back(state.projectId, "connected");
  } catch (err) {
    console.error("[shopify/callback] connect failed:", err);
    return back(state.projectId, "connect_failed");
  }
}
