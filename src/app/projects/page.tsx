import Link from "next/link";
import { redirect } from "next/navigation";

import { createProject, signOutAction } from "@/app/actions";
import { prisma } from "@/lib/db";
import { getAccount } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const account = await getAccount();
  if (!account) redirect("/");
  const projects = await prisma.project.findMany({
    where: { accountId: account.id },
    include: { brandProfile: true, shopify: true, _count: { select: { pieces: true } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <main className="mx-auto max-w-3xl p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Rankenstein</h1>
        <form action={signOutAction}><button className="text-sm text-gray-500">Sign out</button></form>
      </div>
      <p className="mt-1 text-sm text-gray-500">{account.email} · {account.kind} · {account.credits.toLocaleString()} credits</p>

      <ul className="mt-6 space-y-3">
        {projects.map((p) => (
          <li key={p.id} className="rounded-lg border p-4 hover:bg-gray-50">
            <Link href={`/projects/${p.id}`} className="font-medium text-blue-700">{p.name}</Link>
            <div className="text-sm text-gray-500">
              {p.siteUrl} · {p.shopify ? "Shopify connected" : "not connected"} · {p.brandProfile?.confirmed ? "brand confirmed" : "brand pending"} · {p._count.pieces} pieces
            </div>
          </li>
        ))}
        {projects.length === 0 && <li className="text-sm text-gray-400">No projects yet. Create your first below.</li>}
      </ul>

      <form action={createProject} className="mt-10 space-y-3 rounded-lg border p-4">
        <h2 className="font-semibold">New project</h2>
        <input name="name" placeholder="Project / client name" className="w-full rounded border p-2" required />
        <input name="siteUrl" placeholder="yourstore.com" className="w-full rounded border p-2" required />
        <button className="rounded bg-black px-4 py-2 text-white">Create &amp; crawl</button>
        <p className="text-xs text-gray-400">We crawl the site and draft brand guidelines. You confirm them before anything generates.</p>
      </form>
    </main>
  );
}
