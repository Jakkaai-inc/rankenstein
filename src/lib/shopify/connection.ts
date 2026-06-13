// ShopifyConnection service (Lane B). Persists the offline token + store context
// after OAuth and hands back an authenticated Admin client for a project.

import { prisma } from "@/lib/db";
import { NotFoundError, ServiceError } from "@/lib/services/errors";

import { adminClient, type AdminClient } from "./client";

interface ShopContext {
  currency: string | null;
  locale: string | null;
  primaryDomain: string | null;
  blogId: string | null;
}

/**
 * Fetch currency, primary locale, primary domain, and a target blog gid.
 * Best-effort per field: a store/app missing an optional scope (e.g. read_locales)
 * must not abort the connect — we keep whatever is accessible and null the rest.
 */
export async function fetchShopContext(client: AdminClient): Promise<ShopContext> {
  let currency: string | null = null;
  let locale: string | null = null;
  let primaryDomain: string | null = null;
  let blogId: string | null = null;

  try {
    const d = await client.graphql<{ shop: { currencyCode: string | null; primaryDomain: { host: string | null } | null } }>(
      `{ shop { currencyCode primaryDomain { host } } }`,
    );
    currency = d.shop?.currencyCode ?? null;
    primaryDomain = d.shop?.primaryDomain?.host ?? null;
  } catch { /* shop read denied — leave nulls */ }

  try {
    const d = await client.graphql<{ shopLocales: { locale: string; primary: boolean }[] }>(`{ shopLocales { locale primary } }`);
    locale = d.shopLocales?.find((l) => l.primary)?.locale ?? d.shopLocales?.[0]?.locale ?? null;
  } catch { /* read_locales not granted — locale stays null */ }

  try {
    const d = await client.graphql<{ blogs: { nodes: { id: string }[] } }>(`{ blogs(first: 1) { nodes { id } } }`);
    blogId = d.blogs?.nodes?.[0]?.id ?? null;
  } catch { /* read_content not granted — articles unavailable, products unaffected */ }

  return { currency, locale, primaryDomain, blogId };
}

/** Upsert the connection for a project after a successful OAuth token exchange. */
export async function saveConnection(args: {
  projectId: string;
  shopDomain: string;
  accessToken: string;
  scopes: string;
  context: ShopContext;
}) {
  const { projectId, shopDomain, accessToken, scopes, context } = args;
  return prisma.shopifyConnection.upsert({
    where: { projectId },
    create: {
      projectId,
      shopDomain,
      accessToken,
      scopes,
      currency: context.currency,
      locale: context.locale,
      primaryDomain: context.primaryDomain,
      blogId: context.blogId,
    },
    update: {
      shopDomain,
      accessToken,
      scopes,
      currency: context.currency,
      locale: context.locale,
      primaryDomain: context.primaryDomain,
      blogId: context.blogId,
    },
  });
}

/** Load the connection for a project (no token leaked beyond this module's callers). */
export async function getConnection(projectId: string) {
  return prisma.shopifyConnection.findUnique({ where: { projectId } });
}

/**
 * Resolve a project to an authenticated Admin client, throwing a clean error if
 * the store is not connected yet (the publish/sync gate).
 */
export async function requireAdminClient(projectId: string): Promise<{ client: AdminClient; connection: NonNullable<Awaited<ReturnType<typeof getConnection>>> }> {
  const connection = await getConnection(projectId);
  if (!connection) throw new NotFoundError("shopify not connected for this project");
  if (!connection.accessToken) throw new ServiceError("shopify connection has no access token (reconnect required)", 409);
  return { client: adminClient(connection.shopDomain, connection.accessToken), connection };
}
