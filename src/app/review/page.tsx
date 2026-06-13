import Link from "next/link";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/db";
import { getAccount } from "@/lib/session";

export const dynamic = "force-dynamic";

const STATUS_STYLE: Record<string, string> = {
  PENDING_REVIEW: "bg-amber-100 text-amber-800",
  CHANGES_REQUESTED: "bg-orange-100 text-orange-800",
  APPROVED: "bg-green-100 text-green-800",
  PUBLISHED: "bg-blue-100 text-blue-800",
  FLAGGED: "bg-red-100 text-red-800",
};

function StatusBadge({ status }: { status: string }) {
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLE[status] ?? "bg-gray-100 text-gray-700"}`}>{status.toLowerCase().replace("_", " ")}</span>;
}

export default async function ReviewQueue({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  const account = await getAccount();
  if (!account) redirect("/");
  const { project } = await searchParams;

  const pieces = await prisma.contentItem.findMany({
    where: {
      project: { accountId: account.id, ...(project ? { id: project } : {}) },
      status: { in: ["PENDING_REVIEW", "CHANGES_REQUESTED", "APPROVED"] },
    },
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
    take: 100,
    select: {
      id: true,
      title: true,
      kind: true,
      status: true,
      primaryKeyword: true,
      updatedAt: true,
      project: { select: { name: true } },
      _count: { select: { comments: true } },
    },
  });

  const pending = pieces.filter((p) => p.status === "PENDING_REVIEW" || p.status === "CHANGES_REQUESTED");
  const approved = pieces.filter((p) => p.status === "APPROVED");

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-8">
      <header>
        <Link href="/projects" className="text-sm text-gray-500">← projects</Link>
        <h1 className="text-2xl font-bold">Review queue</h1>
        <p className="text-sm text-gray-500">{pending.length} awaiting review · {approved.length} approved · nothing publishes without your approval.</p>
      </header>

      {pieces.length === 0 && <p className="rounded-lg border border-dashed p-8 text-center text-gray-400">Nothing in the queue. Run the engine to draft pieces.</p>}

      {pending.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Needs review</h2>
          {pending.map((p) => (
            <ReviewRow key={p.id} p={p} />
          ))}
        </section>
      )}

      {approved.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Approved · ready to publish</h2>
          {approved.map((p) => (
            <ReviewRow key={p.id} p={p} />
          ))}
        </section>
      )}
    </main>
  );
}

type Row = {
  id: string;
  title: string | null;
  kind: string;
  status: string;
  primaryKeyword: string | null;
  project: { name: string };
  _count: { comments: number };
};

function ReviewRow({ p }: { p: Row }) {
  return (
    <Link href={`/review/${p.id}`} className="flex items-center justify-between gap-4 rounded-lg border p-4 transition-colors hover:border-amber-400">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <StatusBadge status={p.status} />
          <span className="truncate font-semibold">{p.title ?? "Untitled"}</span>
        </div>
        <p className="mt-1 truncate text-sm text-gray-500">
          {p.project.name} · {p.kind === "PRODUCT_REWRITE" ? "product rewrite" : "article"}
          {p.primaryKeyword ? ` · ${p.primaryKeyword}` : ""}
          {p._count.comments > 0 ? ` · ${p._count.comments} comment(s)` : ""}
        </p>
      </div>
      <span className="shrink-0 text-sm text-amber-700">Review →</span>
    </Link>
  );
}
