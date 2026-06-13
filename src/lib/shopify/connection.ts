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

/** Fetch currency, primary locale, primary domain, and a target blog gid. */
export async function fetchShopContext(client: AdminClient): Promise<ShopContext> {
  const data = await client.graphql<{
    shop: { currencyCode: string | null; primaryDomain: { host: string | null } | null };
    shopLocales: { locale: string; primary: boolean }[];
    blogs: { nodes: { id: string }[] };
  }>(`{
    shop { currencyCode primaryDomain { host } }
    shopLocales { locale primary }
    blogs(first: 1) { nodes { id } }
  }`);
  const primaryLocale = data.shopLocales?.find((l) => l.primary)?.locale ?? data.shopLocales?.[0]?.locale ?? null;
  return {
    currency: data.shop?.currencyCode ?? null,
    locale: primaryLocale,
    primaryDomain: data.shop?.primaryDomain?.host ?? null,
    blogId: data.blogs?.nodes?.[0]?.id ?? null,
  };
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
