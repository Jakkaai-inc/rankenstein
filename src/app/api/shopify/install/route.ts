// GET /api/shopify/install?projectId=X&shop=ezfabricinc(.myshopify.com)
// Starts non-embedded OAuth: validates the project belongs to the caller, signs
// the projectId into the OAuth state, and 302-redirects to Shopify's authorize
// screen. Cookie (web) or bearer (mobile webview) auth.

import { randomBytes } from "crypto";

import { NextResponse, type NextRequest } from "next/server";

import { prisma } from "@/lib/db";
import { buildAuthorizeUrl, normalizeShopDomain, requireAccountFlexible, signState } from "@/lib/shopify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  let account;
  try {
    account = await requireAccountFlexible(req);
  } catch {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const url = new URL(req.url);
  const projectId = url.searchParams.get("projectId");
  const shop = normalizeShopDomain(url.searchParams.get("shop"));
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });
  if (!shop) return NextResponse.json({ error: "valid .myshopify.com shop required" }, { status: 400 });

  const project = await prisma.project.findFirst({ where: { id: projectId, accountId: account.id }, select: { id: true } });
  if (!project) return NextResponse.json({ error: "project not found" }, { status: 404 });

  const state = signState(projectId, randomBytes(16).toString("hex"));
  return NextResponse.redirect(buildAuthorizeUrl(shop, state));
}
