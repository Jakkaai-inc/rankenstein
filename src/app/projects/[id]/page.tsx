import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { runBatch } from "@/app/actions";
import { prisma } from "@/lib/db";
import { getAccount } from "@/lib/session";

export const dynamic = "force-dynamic";

function Stat({ label, value, tone = "default" }: { label: string; value: React.ReactNode; tone?: "default" | "green" | "amber" }) {
  const toneCls = tone === "green" ? "text-green-700" : tone === "amber" ? "text-amber-700" : "text-gray-900";
  return (
    <div className="rounded-xl border bg-white p-4">
      <div className={`text-2xl font-bold ${toneCls}`}>{value}</div>
      <div className="mt-0.5 text-xs uppercase tracking-wide text-gray-500">{label}</div>
    </div>
  );
}

export default async function OverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const account = await getAccount();
  if (!account) redirect("/");
  const { id } = await params;

  const project = await prisma.project.findFirst({
    where: { id, accountId: account.id },
    include: {
      brandProfile: true,
      shopify: { select: { shopDomain: true } },
      runs: { orderBy: { createdAt: "desc" }, take: 5 },
    },
  });
  if (!project) notFound();

  const grouped = await prisma.contentItem.groupBy({ by: ["status"], where: { projectId: id }, _count: true });
  const count = (s: string) => grouped.find((g) => g.status === s)?._count ?? 0;
  const products = await prisma.page.count({ where: { projectId: id, type: "PRODUCT" } });
  const pending = count("PENDING_REVIEW");
  const approved = count("APPROVED");
  const publishedCount = count("PUBLISHED");
  const flagged = count("FAILED");

  const connected = !!project.shopify;
  const brandConfirmed = project.brandProfile?.confirmed ?? false;
  const ready = connected && brandConfirmed;

  const publishedItems = await prisma.contentItem.findMany({
    where: { projectId: id, status: "PUBLISHED", publishedUrl: { not: null } },
    orderBy: { publishedAt: "desc" },
    take: 10,
    select: { id: true, title: true, publishedUrl: true, publishedAt: true, primaryKeyword: true },
  });

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Overview</h1>
        {ready && (
          <div className="flex items-center gap-2">
            <form action={runBatch}>
              <input type="hidden" name="projectId" value={id} />
              <input type="hidden" name="limit" value="2" />
              <button className="rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white">Generate a batch</button>
            </form>
            <Link href="/review" className="rounded-md border bg-white px-4 py-2 text-sm font-medium">Review queue ({pending})</Link>
          </div>
        )}
      </div>

      {/* Setup nudge when not ready */}
      {!ready && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <b>Finish setup to start generating.</b>{" "}
          {!connected && "Connect your Shopify store"}{!connected && !brandConfirmed && " and "}
          {!brandConfirmed && "confirm your brand profile"}.{" "}
          <Link href={`/projects/${id}/settings`} className="font-semibold underline">Go to Settings →</Link>
        </div>
      )}

      {/* Status strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        <div className="rounded-xl border bg-white p-4">
          <div className={`text-sm font-semibold ${connected ? "text-green-700" : "text-gray-400"}`}>{connected ? "● Connected" : "○ Not connected"}</div>
          <div className="mt-0.5 text-xs text-gray-500">{project.shopify?.shopDomain ?? "Shopify"}</div>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <div className={`text-sm font-semibold ${brandConfirmed ? "text-green-700" : "text-gray-400"}`}>{brandConfirmed ? "● Brand ready" : "○ Brand pending"}</div>
          <div className="mt-0.5 truncate text-xs text-gray-500">{project.brandProfile?.brandName ?? "—"}</div>
        </div>
        <Stat label="Products" value={products} />
        <Stat label="Pending review" value={pending} tone={pending ? "amber" : "default"} />
        <Stat label="Approved" value={approved} />
        <Stat label="Published live" value={publishedCount} tone={publishedCount ? "green" : "default"} />
      </div>

      {/* Live publish proof */}
      <section className="rounded-xl border bg-white">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="font-semibold">Published live</h2>
          <Link href={`/projects/${id}/content`} className="text-sm text-blue-700 hover:underline">All content →</Link>
        </div>
        {publishedItems.length === 0 ? (
          <p className="px-4 py-6 text-sm text-gray-400">Nothing published yet. Approve a piece in the review queue, then publish it to your store.</p>
        ) : (
          <ul className="divide-y">
            {publishedItems.map((it) => (
              <li key={it.id} className="flex items-center justify-between gap-4 px-4 py-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{it.title}</div>
                  <div className="truncate text-xs text-gray-500">{it.primaryKeyword}{it.publishedAt ? ` · ${it.publishedAt.toISOString().slice(0, 16).replace("T", " ")}` : ""}</div>
                </div>
                <a href={it.publishedUrl!} target="_blank" rel="noreferrer" className="shrink-0 rounded border px-3 py-1 text-xs text-blue-700 hover:bg-blue-50">View live ↗</a>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Activity + triage */}
      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-xl border bg-white">
          <div className="border-b px-4 py-3"><h2 className="font-semibold">Recent runs</h2></div>
          <ul className="divide-y text-sm">
            {project.runs.map((r) => (
              <li key={r.id} className="flex items-center justify-between px-4 py-2.5 text-gray-600">
                <span>{r.status.toLowerCase()} · {r.done}/{r.total} done · {r.flagged} flagged</span>
                <span className="text-xs text-gray-400">{r.createdAt.toISOString().slice(0, 16).replace("T", " ")}</span>
              </li>
            ))}
            {project.runs.length === 0 && <li className="px-4 py-6 text-gray-400">No runs yet.</li>}
          </ul>
        </section>
        <section className="rounded-xl border bg-white">
          <div className="border-b px-4 py-3"><h2 className="font-semibold">Triage</h2></div>
          <div className="px-4 py-3 text-sm text-gray-600">
            {flagged > 0 ? (
              <>{flagged} piece(s) were <b>flagged by the verifier</b> and held out of the review queue (ungrounded claims caught before they reached a human).</>
            ) : (
              <span className="text-gray-400">No flagged pieces. The grounding verifier passed everything in the queue.</span>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
