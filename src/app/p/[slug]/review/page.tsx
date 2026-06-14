import { notFound, redirect } from "next/navigation";

import { prisma } from "@/lib/db";
import { getAccount } from "@/lib/session";
import { findProjectBySlug } from "@/lib/slug";
import ReviewTable, { type ReviewRow } from "@/components/preview/ReviewTable";
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
    // never hidden — the table keeps them with a FAILED status + a "Triage" action.
    where: { projectId: project.id, status: { in: ["PENDING_REVIEW", "CHANGES_REQUESTED", "APPROVED", "PUBLISHED", "FAILED"] } },
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
    take: 200,
    select: { id: true, title: true, kind: true, action: true, status: true, primaryKeyword: true, updatedAt: true, _count: { select: { comments: true } } },
  });

  const rows: ReviewRow[] = pieces.map((p) => ({
    id: p.id,
    title: p.title,
    kind: p.kind,
    action: p.action,
    status: p.status,
    primaryKeyword: p.primaryKeyword,
    comments: p._count.comments,
    updatedAt: p.updatedAt.toISOString(),
  }));

  const pending = rows.filter((r) => r.status === "PENDING_REVIEW" || r.status === "CHANGES_REQUESTED").length;
  const approved = rows.filter((r) => r.status === "APPROVED").length;
  const published = rows.filter((r) => r.status === "PUBLISHED").length;
  const flagged = rows.filter((r) => r.status === "FAILED").length;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-xl font-bold">Review</h1>
        <p className="text-muted-foreground text-sm">
          {pending} awaiting review · {approved} approved · {published} live
          {flagged > 0 ? ` · ${flagged} flagged for triage` : ""} · nothing publishes without your approval.
        </p>
      </div>

      {rows.length === 0 ? (
        <Card className="border-dashed"><div className="text-muted-foreground p-8 text-center text-sm">Nothing to review yet. Generate a batch from Overview.</div></Card>
      ) : (
        <ReviewTable slug={slug} rows={rows} />
      )}
    </div>
  );
}
