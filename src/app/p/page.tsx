import Link from "next/link";
import { redirect } from "next/navigation";

import { createProject, signOutAction } from "@/app/actions";
import { prisma } from "@/lib/db";
import { getAccount } from "@/lib/session";
import { deriveSlug } from "@/lib/slug";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

export default async function ProjectsListPage() {
  const account = await getAccount();
  if (!account) redirect("/login");
  const projects = await prisma.project.findMany({
    where: { accountId: account.id },
    include: { brandProfile: true, shopify: true, _count: { select: { pieces: true } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="bg-muted/30 min-h-screen">
      <header className="bg-background flex items-center justify-between border-b px-6 py-3">
        <span className="text-base font-bold tracking-tight">Rankenstein</span>
        <div className="text-muted-foreground flex items-center gap-3 text-sm">
          <span className="hidden sm:inline">{account.email} · {account.credits.toLocaleString()} credits</span>
          <form action={signOutAction}><Button variant="outline" size="sm">Sign out</Button></form>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-6 p-6">
        <h1 className="text-xl font-bold">Projects</h1>

        <div className="space-y-3">
          {projects.map((p) => (
            <Link key={p.id} href={`/p/${deriveSlug(p)}/overview`}>
              <Card className="hover:border-primary/40 transition-colors">
                <CardContent className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-primary font-medium">{p.name}</div>
                    <div className="text-muted-foreground truncate text-sm">{p.siteUrl}</div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge variant={p.shopify ? "success" : "secondary"}>{p.shopify ? "connected" : "not connected"}</Badge>
                    <Badge variant={p.brandProfile?.confirmed ? "info" : "outline"}>{p.brandProfile?.confirmed ? "brand ready" : "brand pending"}</Badge>
                    <span className="text-muted-foreground text-xs">{p._count.pieces} pieces</span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
          {projects.length === 0 && <p className="text-muted-foreground text-sm">No projects yet. Create your first below.</p>}
        </div>

        <Card>
          <CardHeader><CardTitle>New project</CardTitle></CardHeader>
          <CardContent>
            <form action={createProject} className="space-y-3">
              <div className="grid gap-1.5"><Label>Project / client name</Label><Input name="name" placeholder="Client name" required /></div>
              <div className="grid gap-1.5"><Label>Site URL</Label><Input name="siteUrl" placeholder="yourstore.com" required /></div>
              <Button type="submit">Create &amp; crawl</Button>
              <p className="text-muted-foreground text-xs">We crawl the site and draft brand guidelines. You confirm them before anything generates.</p>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
