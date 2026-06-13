// Shopify app config (Lane B). NON-embedded public app 381929357313.
// Secrets come from the environment only (SHOPIFY_API_KEY / SHOPIFY_API_SECRET);
// never committed. APP_URL drives the OAuth callback so the same code works
// against localhost and https://rankenstein.app.

export const SHOPIFY_API_VERSION = "2024-10";

// read/write products + content (content = blogs/articles/pages).
export const SHOPIFY_SCOPES = "read_products,write_products,read_content,write_content";

export interface ShopifyAppConfig {
  apiKey: string;
  apiSecret: string;
  scopes: string;
  appUrl: string;
  redirectUri: string;
}

/** Read app config from the environment, throwing if a secret is missing. */
export function shopifyConfig(): ShopifyAppConfig {
  const apiKey = process.env.SHOPIFY_API_KEY;
  const apiSecret = process.env.SHOPIFY_API_SECRET;
  if (!apiKey || !apiSecret) {
    throw new Error("SHOPIFY_API_KEY / SHOPIFY_API_SECRET not set in the environment");
  }
  // APP_URL is the canonical origin; default to localhost for dev OAuth.
  const appUrl = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return {
    apiKey,
    apiSecret,
    scopes: SHOPIFY_SCOPES,
    appUrl,
    redirectUri: `${appUrl}/api/shopify/callback`,
  };
}

const SHOP_DOMAIN_RE = /^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/;

/**
 * Normalize a user-supplied shop value to its canonical `*.myshopify.com`
 * domain, or null if it is not a valid Shopify shop. Accepts "ezfabricinc",
 * "ezfabricinc.myshopify.com", or a full admin URL.
 */
export function normalizeShopDomain(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let shop = raw.trim().toLowerCase();
  shop = shop.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!shop) return null;
  if (!shop.includes(".")) shop = `${shop}.myshopify.com`;
  return SHOP_DOMAIN_RE.test(shop) ? shop : null;
}
