import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ExternalLink, Plug, BadgeCheck, Package, ClipboardList, CheckCircle2, Rocket } from "lucide-react";

import { runBatch } from "@/app/actions";
import { prisma } from "@/lib/db";
import { getAccount } from "@/lib/session";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

function Stat({ icon, label, value, tone = "default" }: { icon: React.ReactNode; label: string; value: React.ReactNode; tone?: "default" | "green" | "amber" }) {
  const toneCls = tone === "green" ? "text-emerald-600" : tone === "amber" ? "text-amber-600" : "text-foreground";
  return (
    <Card className="gap-0 py-4">
      <CardContent className="px-4">
        <div className="text-muted-foreground flex items-center gap-1.5 text-xs">{icon}{label}</div>
        <div className={`mt-1 text-2xl font-bold ${toneCls}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

export default async function OverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const account = await getAccount();
  if (!account) redirect("/");
  const { id } = await params;

  const project = await prisma.project.findFirst({
    where: { id, accountId: account.id },
    include: { brandProfile: true, shopify: { select: { shopDomain: true } }, runs: { orderBy: { createdAt: "desc" }, take: 5 } },
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
              <Button type="submit"><Rocket className="size-4" />Generate a batch</Button>
            </form>
            <Button variant="outline" asChild><Link href="/review">Review queue ({pending})</Link></Button>
          </div>
        )}
      </div>

      {!ready && (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="text-sm text-amber-900">
            <b>Finish setup to start generating.</b>{" "}
            {!connected && "Connect your Shopify store"}{!connected && !brandConfirmed && " and "}
            {!brandConfirmed && "confirm your brand profile"}.{" "}
            <Link href={`/projects/${id}/settings`} className="font-semibold underline">Go to Settings →</Link>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Card className="gap-0 py-4">
          <CardContent className="px-4">
            <div className="text-muted-foreground flex items-center gap-1.5 text-xs"><Plug className="size-3.5" />Shopify</div>
            <div className={`mt-1 text-sm font-semibold ${connected ? "text-emerald-600" : "text-muted-foreground"}`}>{connected ? "Connected" : "Not connected"}</div>
            <div className="text-muted-foreground truncate text-xs">{project.shopify?.shopDomain ?? "—"}</div>
          </CardContent>
        </Card>
        <Card className="gap-0 py-4">
          <CardContent className="px-4">
            <div className="text-muted-foreground flex items-center gap-1.5 text-xs"><BadgeCheck className="size-3.5" />Brand</div>
            <div className={`mt-1 text-sm font-semibold ${brandConfirmed ? "text-emerald-600" : "text-muted-foreground"}`}>{brandConfirmed ? "Ready" : "Pending"}</div>
            <div className="text-muted-foreground truncate text-xs">{project.brandProfile?.brandName ?? "—"}</div>
          </CardContent>
        </Card>
        <Stat icon={<Package className="size-3.5" />} label="Products" value={products} />
        <Stat icon={<ClipboardList className="size-3.5" />} label="Pending" value={pending} tone={pending ? "amber" : "default"} />
        <Stat icon={<CheckCircle2 className="size-3.5" />} label="Approved" value={approved} />
        <Stat icon={<Rocket className="size-3.5" />} label="Published" value={publishedCount} tone={publishedCount ? "green" : "default"} />
      </div>

      <Card className="gap-0 py-0">
        <CardHeader className="flex-row items-center justify-between border-b py-3">
          <CardTitle className="text-base">Published live</CardTitle>
          <Link href={`/projects/${id}/content`} className="text-primary text-sm hover:underline">All content →</Link>
        </CardHeader>
        <CardContent className="px-0">
          {publishedItems.length === 0 ? (
            <p className="text-muted-foreground px-6 py-6 text-sm">Nothing published yet. Approve a piece in the review queue, then publish it to your store.</p>
          ) : (
            <ul className="divide-y">
              {publishedItems.map((it) => (
                <li key={it.id} className="flex items-center justify-between gap-4 px-6 py-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{it.title}</div>
                    <div className="text-muted-foreground truncate text-xs">{it.primaryKeyword}{it.publishedAt ? ` · ${it.publishedAt.toISOString().slice(0, 16).replace("T", " ")}` : ""}</div>
                  </div>
                  <Button variant="outline" size="sm" asChild>
                    <a href={it.publishedUrl!} target="_blank" rel="noreferrer">View live <ExternalLink className="size-3.5" /></a>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="gap-0 py-0">
          <CardHeader className="border-b py-3"><CardTitle className="text-base">Recent runs</CardTitle></CardHeader>
          <CardContent className="px-0">
            <ul className="divide-y text-sm">
              {project.runs.map((r) => (
                <li key={r.id} className="text-muted-foreground flex items-center justify-between px-6 py-2.5">
                  <span>{r.status.toLowerCase()} · {r.done}/{r.total} done · {r.flagged} flagged</span>
                  <span className="text-muted-foreground/70 text-xs">{r.createdAt.toISOString().slice(0, 16).replace("T", " ")}</span>
                </li>
              ))}
              {project.runs.length === 0 && <li className="text-muted-foreground px-6 py-6">No runs yet.</li>}
            </ul>
          </CardContent>
        </Card>
        <Card className="gap-0 py-0">
          <CardHeader className="border-b py-3"><CardTitle className="text-base">Triage</CardTitle></CardHeader>
          <CardContent className="text-muted-foreground py-3 text-sm">
            {flagged > 0 ? (
              <>{flagged} piece(s) were <b className="text-foreground">flagged by the verifier</b> and held out of the review queue (ungrounded claims caught before they reached a human).</>
            ) : (
              <span>No flagged pieces. The grounding verifier passed everything in the queue.</span>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
