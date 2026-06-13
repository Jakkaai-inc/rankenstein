// Admin API client (Lane B). A thin authenticated fetch over the Shopify Admin
// GraphQL + REST endpoints for a single shop. GraphQL is the primary surface
// (products, shop context); REST is used for blog articles where it is the most
// universally supported path.

import { SHOPIFY_API_VERSION } from "./config";

export interface AdminClient {
  shop: string;
  graphql<T = unknown>(query: string, variables?: Record<string, unknown>): Promise<T>;
  rest<T = unknown>(method: string, path: string, body?: unknown): Promise<T>;
}

export class ShopifyApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ShopifyApiError";
  }
}

/** Build an Admin API client bound to one shop + offline token. */
export function adminClient(shop: string, accessToken: string): AdminClient {
  const base = `https://${shop}/admin/api/${SHOPIFY_API_VERSION}`;
  const headers = {
    "X-Shopify-Access-Token": accessToken,
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  return {
    shop,
    async graphql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
      const res = await fetch(`${base}/graphql.json`, {
        method: "POST",
        headers,
        body: JSON.stringify({ query, variables }),
      });
      const text = await res.text();
      if (!res.ok) throw new ShopifyApiError(`GraphQL ${res.status}: ${text.slice(0, 300)}`, res.status);
      const parsed = JSON.parse(text) as { data?: T; errors?: unknown };
      if (parsed.errors) {
        throw new ShopifyApiError(`GraphQL errors: ${JSON.stringify(parsed.errors).slice(0, 300)}`, 422);
      }
      return parsed.data as T;
    },
    async rest<T>(method: string, path: string, body?: unknown): Promise<T> {
      const res = await fetch(`${base}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const text = await res.text();
      if (!res.ok) throw new ShopifyApiError(`REST ${method} ${path} ${res.status}: ${text.slice(0, 300)}`, res.status);
      return (text ? JSON.parse(text) : {}) as T;
    },
  };
}

/** Surface a clean message + status from any thrown Shopify/user error. */
export function shopifyUserErrors(userErrors: { field?: string[] | null; message: string }[] | undefined): string | null {
  if (!userErrors || userErrors.length === 0) return null;
  return userErrors.map((e) => `${(e.field ?? []).join(".")}: ${e.message}`).join("; ");
}
