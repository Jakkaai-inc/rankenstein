// Human-readable project slugs for URLs (/p/[slug]/…, /r/[slug]/…).
// Derived in code (no DB column): prefer the Shopify store handle (ezfabric.myshopify.com
// -> "ezfabric"), else the site host (ezfabricinc.com -> "ezfabricinc"), else the name.
// Resolution scans the account's projects and matches the derived slug — fine for the
// project counts we have; swap to a stored Project.slug column when scaling.

import { prisma } from "@/lib/db";

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\.(myshopify\.com|com|app|io|co|net|org|store)(\/.*)?$/i, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

interface SluggableProject {
  name: string;
  siteUrl: string;
  shopify?: { shopDomain: string } | null;
}

export function deriveSlug(p: SluggableProject): string {
  if (p.shopify?.shopDomain) return slugify(p.shopify.shopDomain) || slugify(p.name);
  return slugify(p.siteUrl) || slugify(p.name);
}

/** Resolve a slug to a project owned by the account (matches the derived slug). */
export async function findProjectBySlug(accountId: string, slug: string) {
  const projects = await prisma.project.findMany({
    where: { accountId },
    include: { shopify: { select: { shopDomain: true } } },
  });
  return projects.find((p) => deriveSlug(p) === slug) ?? null;
}
