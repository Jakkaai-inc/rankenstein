// Publish + rollback (Lane B) — the live-publish demo gate.
//
// HARD RULES enforced here:
//   - Nothing publishes without human approval: the ContentItem must be APPROVED.
//   - Version snapshot BEFORE every store write: every push (publish OR rollback)
//     first captures the CURRENT live store content into a ContentVersion
//     (isLivePush=true), so we can always restore exactly what was overwritten.
//
// Product rewrites update descriptionHtml + SEO via GraphQL. Articles create or
// update via REST (the most universally supported article path). One-click
// rollback re-pushes a chosen snapshot (or deletes a we-created article).

import { prisma } from "@/lib/db";
import { ServiceError, NotFoundError } from "@/lib/services/errors";

import { type AdminClient, shopifyUserErrors } from "./client";
import { requireAdminClient } from "./connection";

// ── snapshot helpers ─────────────────────────────────────────────────────────

async function nextVersion(contentItemId: string): Promise<number> {
  const last = await prisma.contentVersion.findFirst({
    where: { contentItemId },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  return (last?.version ?? 0) + 1;
}

interface LiveState {
  html: string;
  meta: Record<string, unknown>;
}

/** Capture the current live store content as a new ContentVersion (snapshot-first). */
async function snapshotLive(contentItemId: string, live: LiveState, note: string) {
  const version = await nextVersion(contentItemId);
  return prisma.contentVersion.create({
    data: { contentItemId, version, html: live.html, meta: live.meta as never, note, isLivePush: true },
  });
}

// ── product gid resolution ───────────────────────────────────────────────────

function numericId(gidOrId: string): string {
  const m = gidOrId.match(/(\d+)$/);
  return m ? m[1] : gidOrId;
}

interface LiveProduct {
  id: string; // gid
  title: string;
  descriptionHtml: string;
  onlineStoreUrl: string | null;
  seo: { title: string | null; description: string | null };
}

/** Fetch the current live product for a ContentItem.sourceRef (gid, numeric id, or handle). */
async function fetchLiveProduct(client: AdminClient, sourceRef: string): Promise<LiveProduct> {
  const isGid = sourceRef.startsWith("gid://");
  const isNumeric = /^\d+$/.test(sourceRef);
  const FIELDS = `id title descriptionHtml onlineStoreUrl seo { title description }`;
  if (isGid || isNumeric) {
    const gid = isGid ? sourceRef : `gid://shopify/Product/${sourceRef}`;
    const data = await client.graphql<{ product: LiveProduct | null }>(
      `query($id: ID!) { product(id: $id) { ${FIELDS} } }`,
      { id: gid },
    );
    if (!data.product) throw new NotFoundError(`product not found in store: ${sourceRef}`);
    return data.product;
  }
  const data = await client.graphql<{ productByHandle: LiveProduct | null }>(
    `query($handle: String!) { productByHandle(handle: $handle) { ${FIELDS} } }`,
    { handle: sourceRef },
  );
  if (!data.productByHandle) throw new NotFoundError(`product not found in store: ${sourceRef}`);
  return data.productByHandle;
}

async function writeProduct(
  client: AdminClient,
  id: string,
  html: string,
  meta: { metaTitle?: unknown; metaDescription?: unknown },
): Promise<{ onlineStoreUrl: string | null }> {
  const data = await client.graphql<{
    productUpdate: { product: { id: string; onlineStoreUrl: string | null } | null; userErrors: { field?: string[] | null; message: string }[] };
  }>(
    `mutation($input: ProductInput!) {
      productUpdate(input: $input) {
        product { id onlineStoreUrl }
        userErrors { field message }
      }
    }`,
    {
      input: {
        id,
        descriptionHtml: html,
        seo: {
          title: (meta.metaTitle as string) ?? undefined,
          description: (meta.metaDescription as string) ?? undefined,
        },
      },
    },
  );
  const err = shopifyUserErrors(data.productUpdate.userErrors);
  if (err) throw new ServiceError(`shopify productUpdate rejected: ${err}`, 422);
  return { onlineStoreUrl: data.productUpdate.product?.onlineStoreUrl ?? null };
}

// ── article (REST) ─────────────────────────────────────────────────────────

interface RestArticle {
  id: number;
  title: string;
  body_html: string;
  handle: string;
}

async function createArticle(
  client: AdminClient,
  blogNumericId: string,
  article: { title: string; body_html: string; handle?: string },
): Promise<RestArticle> {
  const data = await client.rest<{ article: RestArticle }>("POST", `/blogs/${blogNumericId}/articles.json`, { article });
  return data.article;
}

async function fetchArticle(client: AdminClient, blogNumericId: string, articleId: string): Promise<RestArticle> {
  const data = await client.rest<{ article: RestArticle }>("GET", `/blogs/${blogNumericId}/articles/${articleId}.json`);
  return data.article;
}

async function updateArticle(
  client: AdminClient,
  blogNumericId: string,
  articleId: string,
  article: { title?: string; body_html?: string },
): Promise<RestArticle> {
  const data = await client.rest<{ article: RestArticle }>(
    "PUT",
    `/blogs/${blogNumericId}/articles/${articleId}.json`,
    { article },
  );
  return data.article;
}

async function deleteArticle(client: AdminClient, blogNumericId: string, articleId: string): Promise<void> {
  await client.rest("DELETE", `/blogs/${blogNumericId}/articles/${articleId}.json`);
}

/**
 * Resolve a blog's real handle (blog handles are arbitrary, not always "news").
 * Falls back to "blogs" only if the blog read fails, so the URL is still rooted
 * correctly even on an unexpected store shape.
 */
async function fetchBlogHandle(client: AdminClient, blogNumericId: string): Promise<string> {
  try {
    const data = await client.rest<{ blog: { handle: string } }>("GET", `/blogs/${blogNumericId}.json`);
    return data.blog?.handle ?? "blogs";
  } catch {
    return "blogs";
  }
}

// ── public: publish ──────────────────────────────────────────────────────────

export interface PublishResult {
  contentItemId: string;
  status: "PUBLISHED";
  publishedUrl: string | null;
  snapshotVersion: number;
  kind: "PRODUCT_REWRITE" | "ARTICLE";
}

async function loadApprovedItem(contentItemId: string) {
  const item = await prisma.contentItem.findUnique({ where: { id: contentItemId } });
  if (!item) throw new NotFoundError("content item not found");
  // Human-approval gate: never publish anything not explicitly approved.
  if (item.status !== "APPROVED") {
    throw new ServiceError(`content item must be APPROVED to publish (is ${item.status})`, 409);
  }
  if (!item.html) throw new ServiceError("content item has no html to publish", 422);
  return item;
}

/** Publish an APPROVED ContentItem to the live store, snapshotting live state first. */
export async function publishContentItem(contentItemId: string): Promise<PublishResult> {
  const item = await loadApprovedItem(contentItemId);
  const { client, connection } = await requireAdminClient(item.projectId);

  if (item.kind === "PRODUCT_REWRITE") {
    if (!item.sourceRef) throw new ServiceError("product rewrite has no sourceRef to target", 422);
    const live = await fetchLiveProduct(client, item.sourceRef);

    // 1. snapshot the live product BEFORE overwriting it.
    const snap = await snapshotLive(
      contentItemId,
      { html: live.descriptionHtml ?? "", meta: { seoTitle: live.seo?.title ?? null, seoDescription: live.seo?.description ?? null, productTitle: live.title } },
      "pre-publish live product snapshot",
    );

    // 2. push the approved rewrite.
    const { onlineStoreUrl } = await writeProduct(client, live.id, item.html!, {
      metaTitle: item.metaTitle,
      metaDescription: item.metaDescription,
    });

    const publishedUrl = onlineStoreUrl ?? live.onlineStoreUrl;
    await prisma.contentItem.update({
      where: { id: contentItemId },
      data: { status: "PUBLISHED", publishedUrl, publishedAt: new Date() },
    });
    return { contentItemId, status: "PUBLISHED", publishedUrl, snapshotVersion: snap.version, kind: "PRODUCT_REWRITE" };
  }

  // ARTICLE
  if (!connection.blogId) throw new ServiceError("store has no blog configured for article publish", 409);
  const blogNumericId = numericId(connection.blogId);
  const isUpdate = !!item.sourceRef; // sourceRef holds the article gid once created
  let publishedArticle: RestArticle;
  let snapshotVersion: number;

  if (isUpdate) {
    const articleNumericId = numericId(item.sourceRef!);
    const existing = await fetchArticle(client, blogNumericId, articleNumericId);
    const snap = await snapshotLive(
      contentItemId,
      { html: existing.body_html ?? "", meta: { title: existing.title, articleId: item.sourceRef } },
      "pre-publish live article snapshot",
    );
    snapshotVersion = snap.version;
    publishedArticle = await updateArticle(client, blogNumericId, articleNumericId, {
      title: item.title ?? existing.title,
      body_html: item.html!,
    });
  } else {
    // brand-new article: snapshot an "absent" baseline so rollback deletes it.
    const snap = await snapshotLive(contentItemId, { html: "", meta: { absent: true } }, "pre-publish baseline: article did not exist");
    snapshotVersion = snap.version;
    publishedArticle = await createArticle(client, blogNumericId, {
      title: item.title ?? "Untitled",
      body_html: item.html!,
      handle: item.slug ?? undefined,
    });
  }

  const articleGid = `gid://shopify/Article/${publishedArticle.id}`;
  const origin = connection.primaryDomain ? `https://${connection.primaryDomain}` : `https://${connection.shopDomain}`;
  const blogHandle = await fetchBlogHandle(client, blogNumericId);
  const publishedUrl = `${origin}/blogs/${blogHandle}/${publishedArticle.handle}`;
  await prisma.contentItem.update({
    where: { id: contentItemId },
    // persist the created article gid in sourceRef so future publish/rollback target it.
    data: { status: "PUBLISHED", publishedUrl, publishedAt: new Date(), sourceRef: articleGid },
  });
  return { contentItemId, status: "PUBLISHED", publishedUrl, snapshotVersion, kind: "ARTICLE" };
}

// ── public: rollback ─────────────────────────────────────────────────────────

export interface RollbackResult {
  contentItemId: string;
  restoredVersion: number;
  preRollbackSnapshotVersion: number;
  deletedArticle: boolean;
}

/**
 * One-click rollback: restore a snapshot to the live store. Defaults to the most
 * recent pre-publish live snapshot (isLivePush=true). Snapshots the current live
 * state before writing, so the rollback itself is reversible too.
 */
export async function rollbackContentItem(contentItemId: string, version?: number): Promise<RollbackResult> {
  const item = await prisma.contentItem.findUnique({ where: { id: contentItemId } });
  if (!item) throw new NotFoundError("content item not found");
  const { client, connection } = await requireAdminClient(item.projectId);

  const target =
    version != null
      ? await prisma.contentVersion.findUnique({ where: { contentItemId_version: { contentItemId, version } } })
      : await prisma.contentVersion.findFirst({
          where: { contentItemId, isLivePush: true },
          orderBy: { version: "desc" },
        });
  if (!target) throw new NotFoundError("no snapshot available to roll back to");

  if (item.kind === "PRODUCT_REWRITE") {
    if (!item.sourceRef) throw new ServiceError("product rewrite has no sourceRef to target", 422);
    const live = await fetchLiveProduct(client, item.sourceRef);
    // snapshot current (our published) state before restoring.
    const pre = await snapshotLive(
      contentItemId,
      { html: live.descriptionHtml ?? "", meta: { seoTitle: live.seo?.title ?? null, seoDescription: live.seo?.description ?? null, productTitle: live.title } },
      `pre-rollback snapshot (restoring v${target.version})`,
    );
    const meta = (target.meta ?? {}) as { seoTitle?: unknown; seoDescription?: unknown };
    await writeProduct(client, live.id, target.html, { metaTitle: meta.seoTitle, metaDescription: meta.seoDescription });
    await prisma.contentItem.update({
      where: { id: contentItemId },
      data: { status: "APPROVED", publishedUrl: null, publishedAt: null },
    });
    return { contentItemId, restoredVersion: target.version, preRollbackSnapshotVersion: pre.version, deletedArticle: false };
  }

  // ARTICLE
  if (!connection.blogId) throw new ServiceError("store has no blog configured", 409);
  const blogNumericId = numericId(connection.blogId);
  if (!item.sourceRef) throw new ServiceError("article has no id to roll back", 422);
  const articleNumericId = numericId(item.sourceRef);
  const targetMeta = (target.meta ?? {}) as { absent?: boolean; title?: string };

  // snapshot the current live article before changing it.
  let pre;
  let deletedArticle = false;
  try {
    const existing = await fetchArticle(client, blogNumericId, articleNumericId);
    pre = await snapshotLive(
      contentItemId,
      { html: existing.body_html ?? "", meta: { title: existing.title, articleId: item.sourceRef } },
      `pre-rollback snapshot (restoring v${target.version})`,
    );
  } catch {
    pre = await snapshotLive(contentItemId, { html: "", meta: { absent: true } }, `pre-rollback snapshot (article already absent)`);
  }

  if (targetMeta.absent) {
    // the snapshot baseline was "article did not exist" -> remove what we created.
    await deleteArticle(client, blogNumericId, articleNumericId);
    deletedArticle = true;
  } else {
    await updateArticle(client, blogNumericId, articleNumericId, { title: targetMeta.title, body_html: target.html });
  }

  await prisma.contentItem.update({
    where: { id: contentItemId },
    data: { status: "APPROVED", publishedUrl: null, publishedAt: null },
  });
  return { contentItemId, restoredVersion: target.version, preRollbackSnapshotVersion: pre.version, deletedArticle };
}
