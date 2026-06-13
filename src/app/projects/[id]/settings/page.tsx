import { notFound, redirect } from "next/navigation";

import { confirmBrandProfile, draftBrand } from "@/app/actions";
import { prisma } from "@/lib/db";
import { getAccount } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function SettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const account = await getAccount();
  if (!account) redirect("/");
  const { id } = await params;

  const project = await prisma.project.findFirst({
    where: { id, accountId: account.id },
    include: { brandProfile: true, shopify: true },
  });
  if (!project) notFound();
  const p = project.brandProfile;
  const s = project.shopify;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-xl font-bold">Settings</h1>

      {/* Shopify connection */}
      <section className="rounded-xl border bg-white p-5">
        <h2 className="font-semibold">Shopify connection</h2>
        {s ? (
          <div className="mt-3 space-y-1 text-sm text-gray-700">
            <div><span className="text-gray-500">Store: </span><b>{s.shopDomain}</b></div>
            <div><span className="text-gray-500">Scopes: </span>{s.scopes ?? "—"}</div>
            <div><span className="text-gray-500">Currency: </span>{s.currency ?? "—"} · <span className="text-gray-500">Domain: </span>{s.primaryDomain ?? "—"}</div>
            <div className="text-xs text-gray-400">Connected {s.installedAt.toISOString().slice(0, 10)}</div>
          </div>
        ) : (
          <form action="/api/shopify/install" method="get" className="mt-3 flex flex-wrap items-end gap-2">
            <input type="hidden" name="projectId" value={id} />
            <label className="text-sm">
              Store domain
              <input name="shop" placeholder="your-store.myshopify.com" className="mt-1 block w-72 rounded border p-2" required />
            </label>
            <button className="rounded bg-gray-900 px-4 py-2 text-sm text-white">Connect with OAuth</button>
          </form>
        )}
      </section>

      {/* Brand profile */}
      <section className="rounded-xl border bg-white p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Brand profile</h2>
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${p?.confirmed ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}`}>
            {p?.confirmed ? "confirmed" : "not confirmed"}
          </span>
        </div>
        <p className="mt-1 text-sm text-gray-500">Drafted from your site crawl. Nothing generates until confirmed. Research starts from your seed topics.</p>

        <form action={draftBrand} className="mt-3">
          <input type="hidden" name="projectId" value={id} />
          <button className="rounded border px-3 py-1.5 text-sm">{p ? "Re-draft from site" : "Draft from site crawl"}</button>
        </form>

        <form action={confirmBrandProfile} className="mt-4 space-y-2 text-sm">
          <input type="hidden" name="projectId" value={id} />
          <div className="grid grid-cols-2 gap-2">
            <label className="block">Brand name<input name="brandName" defaultValue={p?.brandName ?? project.name} className="mt-1 w-full rounded border p-2" required /></label>
            <label className="block">Industry<input name="industry" defaultValue={p?.industry ?? ""} placeholder="e.g. minky fabric & sewing" className="mt-1 w-full rounded border p-2" /></label>
          </div>
          <label className="block">Seed topics (comma-separated) <span className="text-red-600">*</span><input name="seedTopics" defaultValue={(p?.seedTopics ?? []).join(", ")} placeholder="minky fabric, baby blanket fabric" className="mt-1 w-full rounded border p-2" required /></label>
          <label className="block">Audience<textarea name="audience" defaultValue={p?.audience ?? ""} rows={2} className="mt-1 w-full rounded border p-2" /></label>
          <label className="block">Voice<textarea name="voice" defaultValue={p?.voice ?? ""} rows={2} className="mt-1 w-full rounded border p-2" /></label>
          <label className="block">Brand facts (only what is true)<textarea name="brandFacts" defaultValue={p?.brandFacts ?? ""} rows={3} className="mt-1 w-full rounded border p-2" /></label>
          <label className="block">Competitors (comma-separated)<input name="competitors" defaultValue={(p?.competitors ?? []).join(", ")} className="mt-1 w-full rounded border p-2" /></label>
          <button className="rounded bg-gray-900 px-4 py-2 text-white">{p?.confirmed ? "Update profile" : "Confirm & unlock generation"}</button>
        </form>
      </section>

      {/* Run defaults (informational) */}
      <section className="rounded-xl border bg-white p-5 text-sm text-gray-600">
        <h2 className="font-semibold text-gray-900">Generation defaults</h2>
        <p className="mt-1">Each run grounds against your live catalog, runs the full engine (research → ground → rewrite → AEO → guardrails → verify), and only queues pieces an independent verifier passes. Ungrounded claims are flagged and held out of review.</p>
      </section>
    </div>
  );
}
