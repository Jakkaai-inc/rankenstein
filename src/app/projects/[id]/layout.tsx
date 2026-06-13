import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { signOutAction } from "@/app/actions";
import { prisma } from "@/lib/db";
import { getAccount } from "@/lib/session";
import Sidebar from "@/components/dashboard/Sidebar";

export const dynamic = "force-dynamic";

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const account = await getAccount();
  if (!account) redirect("/");
  const { id } = await params;

  const project = await prisma.project.findFirst({
    where: { id, accountId: account.id },
    include: { shopify: { select: { shopDomain: true } } },
  });
  if (!project) notFound();

  const [products, pending, published] = await Promise.all([
    prisma.page.count({ where: { projectId: id, type: "PRODUCT" } }),
    prisma.contentItem.count({ where: { projectId: id, status: "PENDING_REVIEW" } }),
    prisma.contentItem.count({ where: { projectId: id, status: "PUBLISHED" } }),
  ]);

  return (
    <div className="flex min-h-screen flex-col bg-gray-50 text-gray-900">
      <header className="flex items-center justify-between border-b bg-white px-5 py-3">
        <div className="flex items-center gap-3">
          <Link href="/projects" className="text-lg font-bold tracking-tight">Rankenstein</Link>
          <span className="text-gray-300">/</span>
          <div>
            <div className="text-sm font-semibold leading-tight">{project.name}</div>
            <div className="text-xs text-gray-500 leading-tight">{project.siteUrl}</div>
          </div>
          <span className={`ml-1 rounded-full px-2 py-0.5 text-xs font-medium ${project.shopify ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-500"}`}>
            {project.shopify ? "● Shopify connected" : "○ not connected"}
          </span>
        </div>
        <div className="flex items-center gap-3 text-sm text-gray-500">
          <span>{account.email}</span>
          <form action={signOutAction}><button className="rounded border px-3 py-1 text-gray-600 hover:bg-gray-50">Sign out</button></form>
        </div>
      </header>

      <div className="flex flex-1">
        <Sidebar projectId={id} counts={{ products, pending, published }} />
        <main className="flex-1 overflow-x-hidden p-6">{children}</main>
      </div>
    </div>
  );
}
