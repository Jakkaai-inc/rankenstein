import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { runArticles } from "@/app/actions";
import { prisma } from "@/lib/db";
import { getAccount } from "@/lib/session";
import { findProjectBySlug } from "@/lib/slug";
import ContentTable, { type ContentRow } from "@/components/dashboard/ContentTable";
import ContentCalendar, { type PlannedArticle } from "@/components/dashboard/ContentCalendar";
import { Button } from "@/components/ui/button";
import type { VerifierVerdict } from "@/types/contracts";

export const dynamic = "force-dynamic";

export default async function ArticlesPage({ params }: { params: Promise<{ slug: string }> }) {
  const account = await getAccount();
  if (!account) redirect("/login");
  const { slug } = await params;

  const project = await findProjectBySlug(account.id, slug);
  if (!project) notFound();

  const items = await prisma.contentItem.findMany({
    where: { projectId: project.id, kind: "ARTICLE" },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true, title: true, status: true, kind: true, primaryKeyword: true, sourceRef: true,
      updatedAt: true, publishedUrl: true, metaTitle: true, metaDescription: true, html: true,
      brief: true, verifierVerdict: true, _count: { select: { versions: true } },
    },
  });

  // Planned (calendar) = DRAFTING placeholders; generated = everything else.
  const plannedItems = items.filter((it) => it.status === "DRAFTING");
  const generated = items.filter((it) => it.status !== "DRAFTING");

  const planned: PlannedArticle[] = plannedItems
    .map((it) => {
      const b = (it.brief ?? {}) as { scheduledFor?: string; rationale?: string };
      return { id: it.id, title: it.title ?? "Untitled", primaryKeyword: it.primaryKeyword, scheduledFor: b.scheduledFor ?? null, rationale: b.rationale ?? null };
    })
    .sort((a, b) => (a.scheduledFor ?? "").localeCompare(b.scheduledFor ?? ""));

  const rows: ContentRow[] = generated.map((it) => {
    const brief = (it.brief ?? {}) as { secondaryKeywords?: string[] };
    const v = it.verifierVerdict as unknown as VerifierVerdict | null;
    return {
      id: it.id, title: it.title ?? "Untitled", status: it.status, kind: it.kind,
      primaryKeyword: it.primaryKeyword,
      secondaryKeywords: Array.isArray(brief.secondaryKeywords) ? brief.secondaryKeywords.slice(0, 8) : [],
      sourceRef: it.sourceRef, updatedAt: it.updatedAt.toISOString(), publishedUrl: it.publishedUrl,
      metaTitle: it.metaTitle, metaDescription: it.metaDescription,
      html: it.html ?? "<p class='text-muted-foreground'>(no draft)</p>",
      verifier: v ? { verdict: v.verdict, isSelfCheck: !!v.isSelfCheck } : null,
      versions: it._count.versions || 1,
    };
  });

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Articles</h1>
          <p className="text-muted-foreground text-sm">Your content calendar and the articles Rankenstein has drafted.</p>
        </div>
        <form action={runArticles}>
          <input type="hidden" name="projectId" value={project.id} />
          <input type="hidden" name="limit" value="2" />
          <Button type="submit" variant="outline">Generate from seed topics</Button>
        </form>
      </div>

      <ContentCalendar planned={planned} />

      {generated.length > 0 ? (
        <div className="space-y-2">
          <h2 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">Drafted &amp; published</h2>
          <ContentTable slug={slug} rows={rows} />
        </div>
      ) : planned.length === 0 ? (
        <div className="bg-card text-muted-foreground rounded-xl border p-8 text-center text-sm">
          No articles yet. Build a content calendar from the project overview, or <Link href={`/p/${slug}/overview`} className="text-primary underline">generate a batch</Link>.
        </div>
      ) : null}
    </div>
  );
}
