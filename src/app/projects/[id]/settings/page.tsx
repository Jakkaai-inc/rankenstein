import { notFound, redirect } from "next/navigation";

import { confirmBrandProfile, draftBrand } from "@/app/actions";
import { prisma } from "@/lib/db";
import { getAccount } from "@/lib/session";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

export default async function SettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const account = await getAccount();
  if (!account) redirect("/");
  const { id } = await params;

  const project = await prisma.project.findFirst({ where: { id, accountId: account.id }, include: { brandProfile: true, shopify: true } });
  if (!project) notFound();
  const p = project.brandProfile;
  const s = project.shopify;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-xl font-bold">Settings</h1>

      <Card>
        <CardHeader><CardTitle>Shopify connection</CardTitle></CardHeader>
        <CardContent>
          {s ? (
            <div className="text-muted-foreground space-y-1 text-sm">
              <div><span>Store: </span><b className="text-foreground">{s.shopDomain}</b></div>
              <div><span>Scopes: </span>{s.scopes ?? "—"}</div>
              <div><span>Currency: </span>{s.currency ?? "—"} · <span>Domain: </span>{s.primaryDomain ?? "—"}</div>
              <div className="text-muted-foreground/70 text-xs">Connected {s.installedAt.toISOString().slice(0, 10)}</div>
            </div>
          ) : (
            <form action="/api/shopify/install" method="get" className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="projectId" value={id} />
              <div className="grid gap-1.5">
                <Label htmlFor="shop">Store domain</Label>
                <Input id="shop" name="shop" placeholder="your-store.myshopify.com" className="w-72" required />
              </div>
              <Button type="submit">Connect with OAuth</Button>
            </form>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Brand profile
            <Badge variant={p?.confirmed ? "success" : "warning"}>{p?.confirmed ? "confirmed" : "not confirmed"}</Badge>
          </CardTitle>
          <CardDescription>Drafted from your site crawl. Nothing generates until confirmed. Research starts from your seed topics.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form action={draftBrand}>
            <input type="hidden" name="projectId" value={id} />
            <Button type="submit" variant="outline" size="sm">{p ? "Re-draft from site" : "Draft from site crawl"}</Button>
          </form>

          <form action={confirmBrandProfile} className="space-y-3">
            <input type="hidden" name="projectId" value={id} />
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5"><Label>Brand name</Label><Input name="brandName" defaultValue={p?.brandName ?? project.name} required /></div>
              <div className="grid gap-1.5"><Label>Industry</Label><Input name="industry" defaultValue={p?.industry ?? ""} placeholder="e.g. minky fabric & sewing" /></div>
            </div>
            <div className="grid gap-1.5"><Label>Seed topics (comma-separated) *</Label><Input name="seedTopics" defaultValue={(p?.seedTopics ?? []).join(", ")} placeholder="minky fabric, baby blanket fabric" required /></div>
            <div className="grid gap-1.5"><Label>Audience</Label><Textarea name="audience" defaultValue={p?.audience ?? ""} rows={2} /></div>
            <div className="grid gap-1.5"><Label>Voice</Label><Textarea name="voice" defaultValue={p?.voice ?? ""} rows={2} /></div>
            <div className="grid gap-1.5"><Label>Brand facts (only what is true)</Label><Textarea name="brandFacts" defaultValue={p?.brandFacts ?? ""} rows={3} /></div>
            <div className="grid gap-1.5"><Label>Competitors (comma-separated)</Label><Input name="competitors" defaultValue={(p?.competitors ?? []).join(", ")} /></div>
            <Button type="submit">{p?.confirmed ? "Update profile" : "Confirm & unlock generation"}</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Generation defaults</CardTitle></CardHeader>
        <CardContent className="text-muted-foreground text-sm">
          Each run grounds against your live catalog, runs the full engine (research → ground → rewrite → AEO → guardrails → verify), and only queues pieces an independent verifier passes. Ungrounded claims are flagged and held out of review.
        </CardContent>
      </Card>
    </div>
  );
}
