import Link from "next/link";
import { notFound } from "next/navigation";

import { confirmBrandProfile } from "@/app/actions";
import { prisma } from "@/lib/db";
import { requireAccount } from "@/lib/session";

export const dynamic = "force-dynamic";

function Step({ n, title, done, current, children }: { n: number; title: string; done: boolean; current: boolean; children: React.ReactNode }) {
  return (
    <section className={`rounded-lg border p-4 ${!done && !current ? "opacity-60" : ""}`}>
      <h2 className="flex items-center gap-2 font-semibold">
        <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs text-white ${done ? "bg-green-700" : current ? "bg-black" : "bg-gray-300"}`}>{done ? "✓" : n}</span>
        {title}
      </h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const account = await requireAccount();
  const { id } = await params;
  const project = await prisma.project.findFirst({
    where: { id, accountId: account.id },
    include: {
      brandProfile: true,
      shopify: true,
      runs: { orderBy: { createdAt: "desc" }, take: 5 },
      _count: { select: { pieces: true, pages: true } },
    },
  });
  if (!project) notFound();

  const connected = !!project.shopify;
  const brandConfirmed = project.brandProfile?.confirmed ?? false;
  const p = project.brandProfile;

  return (
    <main className="mx-auto max-w-3xl space-y-5 p-8">
      <header>
        <Link href="/projects" className="text-sm text-gray-500">← projects</Link>
        <h1 className="text-2xl font-bold">{project.name}</h1>
        <p className="text-sm text-gray-500">{project.siteUrl} · {project._count.pages} pages · {project._count.pieces} pieces</p>
      </header>

      <Step n={1} title="Connect Shopify" done={connected} current={!connected}>
        {connected ? (
          <p className="text-sm text-gray-600">Connected: {project.shopify!.shopDomain}</p>
        ) : (
          <a href={`/api/shopify/connect?projectId=${project.id}`} className="inline-block rounded bg-black px-4 py-2 text-sm text-white">Connect store with OAuth</a>
        )}
      </Step>

      <Step n={2} title="Brand guidelines" done={brandConfirmed} current={connected && !brandConfirmed}>
        <p className="mb-3 text-sm text-gray-600">Drafted from the site crawl. Nothing generates until you confirm. Research starts from your seed topics.</p>
        <form action={confirmBrandProfile} className="space-y-2 text-sm">
          <input type="hidden" name="projectId" value={project.id} />
          <div className="grid grid-cols-2 gap-2">
            <label className="block">Brand name<input name="brandName" defaultValue={p?.brandName ?? project.name} className="mt-1 w-full rounded border p-2" required /></label>
            <label className="block">Industry<input name="industry" defaultValue={p?.industry ?? ""} placeholder="e.g. minky fabric & sewing" className="mt-1 w-full rounded border p-2" /></label>
          </div>
          <label className="block">Seed topics (comma-separated) <span className="text-red-600">*</span><input name="seedTopics" defaultValue={(p?.seedTopics ?? []).join(", ")} placeholder="minky fabric, baby blanket fabric, how to wash minky" className="mt-1 w-full rounded border p-2" required /></label>
          <label className="block">Audience<textarea name="audience" defaultValue={p?.audience ?? ""} rows={2} className="mt-1 w-full rounded border p-2" /></label>
          <label className="block">Voice<textarea name="voice" defaultValue={p?.voice ?? ""} rows={2} className="mt-1 w-full rounded border p-2" /></label>
          <label className="block">Brand facts (only what is true)<textarea name="brandFacts" defaultValue={p?.brandFacts ?? ""} rows={3} className="mt-1 w-full rounded border p-2" /></label>
          <label className="block">Competitors (comma-separated)<input name="competitors" defaultValue={(p?.competitors ?? []).join(", ")} className="mt-1 w-full rounded border p-2" /></label>
          <button className="rounded bg-black px-4 py-2 text-white">{brandConfirmed ? "Update profile" : "Confirm & unlock generation"}</button>
        </form>
      </Step>

      <Step n={3} title="Configure & run" done={false} current={brandConfirmed}>
        {brandConfirmed ? (
          <div className="space-y-2 text-sm">
            <p className="text-gray-600">Pick content type and layers, then run. Pieces land in the review queue; nothing publishes without your approval.</p>
            <div className="flex gap-3">
              <Link href={`/projects/${project.id}/run`} className="rounded bg-black px-4 py-2 text-white">Configure a run</Link>
              <Link href={`/projects/${project.id}/review`} className="rounded border px-4 py-2">Review queue ({project._count.pieces})</Link>
            </div>
          </div>
        ) : (
          <p className="text-sm text-amber-700">Locked — confirm the brand guidelines first.</p>
        )}
      </Step>

      <section className="rounded-lg border p-4">
        <h2 className="font-semibold">Activity</h2>
        <ul className="mt-2 space-y-1 text-sm">
          {project.runs.map((r) => (
            <li key={r.id} className="text-gray-600">{r.status.toLowerCase()} · {r.done}/{r.total} done · {r.flagged} flagged · {r.createdAt.toISOString().slice(0, 16).replace("T", " ")}</li>
          ))}
          {project.runs.length === 0 && <li className="text-gray-400">No runs yet.</li>}
        </ul>
      </section>
    </main>
  );
}
