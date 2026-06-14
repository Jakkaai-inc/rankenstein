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

/** Resolve a slug to a project owned by the account (matches the derived slug).
 *  DETERMINISTIC: a findMany without orderBy returns rows in arbitrary order, so
 *  when duplicate projects share a slug, different requests could resolve to
 *  different rows (page -> the rich project, an action -> an empty dupe ->
 *  NOT_FOUND). We sort all slug matches and prefer the one with the most content
 *  (then oldest) so every request lands on the same canonical project. */
export async function findProjectBySlug(accountId: string, slug: string) {
  const projects = await prisma.project.findMany({
    where: { accountId },
    include: { shopify: { select: { shopDomain: true } }, _count: { select: { pieces: true } } },
  });
  const matches = projects.filter((p) => deriveSlug(p) === slug);
  if (matches.length === 0) return null;
  matches.sort((a, b) => b._count.pieces - a._count.pieces || +a.createdAt - +b.createdAt);
  return matches[0];
}
