import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { prisma } from "@/lib/db";
import { getAccount } from "@/lib/session";
import { findProjectBySlug } from "@/lib/slug";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { Card } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function DashboardReview({ params }: { params: Promise<{ slug: string }> }) {
  const account = await getAccount();
  if (!account) redirect("/login");
  const { slug } = await params;

  const project = await findProjectBySlug(account.id, slug);
  if (!project) notFound();

  const pieces = await prisma.contentItem.findMany({
    // FAILED pieces are the engine's self-flagged triage cases (verifier failed
    // twice, or a halt). The brief requires they stay VISIBLE for human triage,
    // never hidden — so they are surfaced in their own section below.
    where: { projectId: project.id, status: { in: ["PENDING_REVIEW", "CHANGES_REQUESTED", "APPROVED", "PUBLISHED", "FAILED"] } },
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
    take: 200,
    select: { id: true, title: true, kind: true, status: true, primaryKeyword: true, _count: { select: { comments: true } } },
  });

  const flagged = pieces.filter((p) => p.status === "FAILED");
  const pending = pieces.filter((p) => p.status === "PENDING_REVIEW" || p.status === "CHANGES_REQUESTED");
  const approved = pieces.filter((p) => p.status === "APPROVED");
  const published = pieces.filter((p) => p.status === "PUBLISHED");

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-xl font-bold">Review</h1>
        <p className="text-muted-foreground text-sm">
          {pending.length} awaiting review · {approved.length} approved · {published.length} live
          {flagged.length > 0 ? ` · ${flagged.length} flagged for triage` : ""} · nothing publishes without your approval.
        </p>
      </div>

      {pieces.length === 0 && <Card className="border-dashed"><div className="text-muted-foreground p-8 text-center text-sm">Nothing to review yet. Generate a batch from Overview.</div></Card>}

      <Section title="Flagged · needs triage" rows={flagged} slug={slug} subtitle="The engine could not pass these (verifier failed or grounding halt). Open to see the reason; nothing here can publish." />
      <Section title="Needs review" rows={pending} slug={slug} />
      <Section title="Approved · ready to publish" rows={approved} slug={slug} />
      <Section title="Published live" rows={published} slug={slug} />
    </div>
  );
}

type Row = { id: string; title: string | null; kind: string; status: string; primaryKeyword: string | null; _count: { comments: number } };

function Section({ title, rows, slug, subtitle }: { title: string; rows: Row[]; slug: string; subtitle?: string }) {
  if (rows.length === 0) return null;
  return (
    <section className="space-y-2">
      <h2 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">{title}</h2>
      {subtitle && <p className="text-muted-foreground -mt-1 text-xs">{subtitle}</p>}
      {rows.map((p) => {
        const kind = p.kind === "ARTICLE" ? "article" : "product";
        return (
          <Link key={p.id} href={`/r/${slug}/${kind}/${p.id}`}>
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
              <span className="text-primary shrink-0 text-sm">Open →</span>
            </Card>
          </Link>
        );
      })}
    </section>
  );
}
