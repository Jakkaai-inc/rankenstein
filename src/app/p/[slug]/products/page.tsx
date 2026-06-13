import { notFound, redirect } from "next/navigation";

import { prisma } from "@/lib/db";
import { getAccount } from "@/lib/session";
import { findProjectBySlug } from "@/lib/slug";
import ProductsTable, { type ProductRow } from "@/components/dashboard/ProductsTable";

export const dynamic = "force-dynamic";

export default async function ProductsPage({ params }: { params: Promise<{ slug: string }> }) {
  const account = await getAccount();
  if (!account) redirect("/login");
  const { slug } = await params;

  const project = await findProjectBySlug(account.id, slug);
  if (!project) notFound();

  const [pages, items] = await Promise.all([
    prisma.page.findMany({ where: { projectId: project.id, type: "PRODUCT" }, orderBy: { title: "asc" }, select: { handle: true, title: true, url: true } }),
    prisma.contentItem.findMany({
      where: { projectId: project.id, kind: "PRODUCT_REWRITE", sourceRef: { not: null } },
      orderBy: { updatedAt: "desc" },
      select: { id: true, sourceRef: true, status: true, primaryKeyword: true, brief: true, html: true, updatedAt: true, publishedUrl: true },
    }),
  ]);

  const byHandle = new Map<string, (typeof items)[number]>();
  for (const it of items) if (it.sourceRef && !byHandle.has(it.sourceRef)) byHandle.set(it.sourceRef, it);

  const rows: ProductRow[] = pages.map((pg) => {
    const it = pg.handle ? byHandle.get(pg.handle) : undefined;
    const brief = (it?.brief ?? {}) as { secondaryKeywords?: string[] };
    return {
      handle: pg.handle ?? "",
      title: pg.title ?? pg.handle ?? "Untitled",
      url: pg.url,
      contentItemId: it?.id ?? null,
      status: it?.status ?? null,
      primaryKeyword: it?.primaryKeyword ?? null,
      secondaryKeywords: Array.isArray(brief.secondaryKeywords) ? brief.secondaryKeywords.slice(0, 8) : [],
      rewrittenHtml: it?.html ?? null,
      updatedAt: it?.updatedAt ? it.updatedAt.toISOString() : null,
      publishedUrl: it?.publishedUrl ?? null,
    };
  });

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div>
        <h1 className="text-xl font-bold">Products</h1>
        <p className="text-muted-foreground text-sm">{project.shopify ? `Synced from ${project.shopify.shopDomain}` : "Connect a store to sync products"} · click a row to compare original vs rewritten.</p>
      </div>
      {pages.length === 0 ? (
        <div className="bg-card text-muted-foreground rounded-xl border p-8 text-center text-sm">
          No products synced yet. {project.shopify ? "Run a catalog sync." : "Connect your Shopify store in Settings."}
        </div>
      ) : (
        <ProductsTable slug={slug} projectId={project.id} rows={rows} />
      )}
    </div>
  );
}
