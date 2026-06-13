// Non-embedded OAuth (Lane B). Flow:
//   1. /api/shopify/install signs a state (projectId + nonce) and redirects to
//      Shopify's authorize screen.
//   2. Shopify redirects back to /api/shopify/callback with code + hmac + state.
//   3. We verify the request HMAC, verify our signed state, exchange the code for
//      an OFFLINE access token, and persist it on ShopifyConnection.
//
// State is signed with the app secret (not stored server-side) so the stateless
// callback can trust the projectId without a session. The request HMAC proves
// the callback genuinely came from Shopify.

import { createHmac, timingSafeEqual } from "crypto";

import { shopifyConfig } from "./config";

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function safeEqualHex(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export interface OAuthState {
  projectId: string;
  nonce: string;
  iat: number;
}

/** Sign `{projectId, nonce, iat}` into a tamper-proof `payload.sig` state token. */
export function signState(projectId: string, nonce: string): string {
  const { apiSecret } = shopifyConfig();
  const payload = b64url(Buffer.from(JSON.stringify({ projectId, nonce, iat: Date.now() })));
  const sig = b64url(createHmac("sha256", apiSecret).update(payload).digest());
  return `${payload}.${sig}`;
}

/** Verify and decode a state token; returns null if tampered or older than 1h. */
export function verifyState(state: string | null | undefined): OAuthState | null {
  if (!state || !state.includes(".")) return null;
  const { apiSecret } = shopifyConfig();
  const [payload, sig] = state.split(".");
  const expected = b64url(createHmac("sha256", apiSecret).update(payload).digest());
  if (!safeEqualHex(sig, expected)) return null;
  try {
    const decoded = JSON.parse(fromB64url(payload).toString("utf8")) as OAuthState;
    if (!decoded.projectId || Date.now() - decoded.iat > 60 * 60 * 1000) return null;
    return decoded;
  } catch {
    return null;
  }
}

/** Build the Shopify authorize URL to redirect the merchant to (offline token). */
export function buildAuthorizeUrl(shop: string, state: string): string {
  const { apiKey, scopes, redirectUri } = shopifyConfig();
  const params = new URLSearchParams({
    client_id: apiKey,
    scope: scopes,
    redirect_uri: redirectUri,
    state,
    // omit grant_options[]=per-user -> we get an OFFLINE (permanent) token.
  });
  return `https://${shop}/admin/oauth/authorize?${params.toString()}`;
}

/**
 * Verify the callback request HMAC per Shopify's spec: drop `hmac`/`signature`,
 * sort the remaining params, and compare HMAC-SHA256 over `key=value&...`.
 */
export function verifyCallbackHmac(query: URLSearchParams): boolean {
  const { apiSecret } = shopifyConfig();
  const hmac = query.get("hmac");
  if (!hmac) return false;
  const pairs: string[] = [];
  for (const [k, v] of query.entries()) {
    if (k === "hmac" || k === "signature") continue;
    pairs.push(`${k}=${v}`);
  }
  pairs.sort();
  const digest = createHmac("sha256", apiSecret).update(pairs.join("&")).digest("hex");
  return safeEqualHex(digest, hmac);
}

export interface TokenResponse {
  access_token: string;
  scope: string;
}

/** Exchange an authorization code for an offline access token. */
export async function exchangeCodeForToken(shop: string, code: string): Promise<TokenResponse> {
  const { apiKey, apiSecret } = shopifyConfig();
  const res = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ client_id: apiKey, client_secret: apiSecret, code }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`token exchange failed (${res.status}): ${text.slice(0, 300)}`);
  }
  const data = (await res.json()) as TokenResponse;
  if (!data.access_token) throw new Error("token exchange returned no access_token");
  return data;
}
