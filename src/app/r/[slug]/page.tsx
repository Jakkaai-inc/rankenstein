import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { prisma } from "@/lib/db";
import { getAccount } from "@/lib/session";
import { findProjectBySlug } from "@/lib/slug";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { Card } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function ReviewQueue({ params }: { params: Promise<{ slug: string }> }) {
  const account = await getAccount();
  if (!account) redirect("/login");
  const { slug } = await params;

  const project = await findProjectBySlug(account.id, slug);
  if (!project) notFound();

  const pieces = await prisma.contentItem.findMany({
    where: { projectId: project.id, status: { in: ["PENDING_REVIEW", "CHANGES_REQUESTED", "APPROVED"] } },
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
    take: 100,
    select: { id: true, title: true, kind: true, status: true, primaryKeyword: true, _count: { select: { comments: true } } },
  });

  const pending = pieces.filter((p) => p.status === "PENDING_REVIEW" || p.status === "CHANGES_REQUESTED");
  const approved = pieces.filter((p) => p.status === "APPROVED");

  return (
    <main className="bg-muted/30 min-h-screen">
      <div className="mx-auto max-w-4xl space-y-6 p-8">
        <header>
          <Link href={`/p/${slug}/overview`} className="text-muted-foreground text-sm hover:underline">← {project.name}</Link>
          <h1 className="text-2xl font-bold">Review queue</h1>
          <p className="text-muted-foreground text-sm">{pending.length} awaiting review · {approved.length} approved · nothing publishes without your approval.</p>
        </header>

        {pieces.length === 0 && <p className="text-muted-foreground rounded-xl border border-dashed p-8 text-center">Nothing in the queue. Generate a batch to draft pieces.</p>}

        {pending.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">Needs review</h2>
            {pending.map((p) => <ReviewRow key={p.id} slug={slug} p={p} />)}
          </section>
        )}
        {approved.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">Approved · ready to publish</h2>
            {approved.map((p) => <ReviewRow key={p.id} slug={slug} p={p} />)}
          </section>
        )}
      </div>
    </main>
  );
}

type Row = { id: string; title: string | null; kind: string; status: string; primaryKeyword: string | null; _count: { comments: number } };

function ReviewRow({ slug, p }: { slug: string; p: Row }) {
  const kind = p.kind === "ARTICLE" ? "article" : "product";
  return (
    <Link href={`/r/${slug}/${kind}/${p.id}`}>
      <Card className="hover:border-primary/40 flex-row items-center justify-between gap-4 p-4 transition-colors">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <StatusBadge status={p.status} />
            <span className="truncate font-semibold">{p.title ?? "Untitled"}</span>
          </div>
          <p className="text-muted-foreground mt-1 truncate text-sm">
            {p.kind === "PRODUCT_REWRITE" ? "product rewrite" : "article"}
            {p.primaryKeyword ? ` · ${p.primaryKeyword}` : ""}
            {p._count.comments > 0 ? ` · ${p._count.comments} comment(s)` : ""}
          </p>
        </div>
        <span className="text-primary shrink-0 text-sm">Review →</span>
      </Card>
    </Link>
  );
}
