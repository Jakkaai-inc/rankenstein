import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { signOutAction } from "@/app/actions";
import { prisma } from "@/lib/db";
import { getAccount } from "@/lib/session";
import { findProjectBySlug } from "@/lib/slug";
import Sidebar from "@/components/dashboard/Sidebar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const account = await getAccount();
  if (!account) redirect("/login");
  const { slug } = await params;

  const project = await findProjectBySlug(account.id, slug);
  if (!project) notFound();

  const [products, pending, published] = await Promise.all([
    prisma.page.count({ where: { projectId: project.id, type: "PRODUCT" } }),
    prisma.contentItem.count({ where: { projectId: project.id, status: "PENDING_REVIEW" } }),
    prisma.contentItem.count({ where: { projectId: project.id, status: "PUBLISHED" } }),
  ]);

  return (
    <div className="bg-background text-foreground flex min-h-screen flex-col">
      <header className="bg-background flex items-center justify-between border-b px-5 py-3">
        <div className="flex items-center gap-3">
          <Link href="/p" className="text-base font-bold tracking-tight">Rankenstein</Link>
          <span className="text-muted-foreground/40">/</span>
          <div>
            <div className="text-sm leading-tight font-semibold">{project.name}</div>
            <div className="text-muted-foreground text-xs leading-tight">{project.siteUrl}</div>
          </div>
          <Badge variant={project.shopify ? "success" : "secondary"} className="ml-1">
            {project.shopify ? "● Shopify connected" : "○ not connected"}
          </Badge>
        </div>
        <div className="text-muted-foreground flex items-center gap-3 text-sm">
          <span className="hidden sm:inline">{account.email}</span>
          <form action={signOutAction}><Button variant="outline" size="sm">Sign out</Button></form>
        </div>
      </header>

      <div className="flex flex-1">
        <Sidebar slug={slug} counts={{ products, pending, published }} />
        <main className="bg-muted/30 flex-1 overflow-x-hidden p-6">{children}</main>
      </div>
    </div>
  );
}
