"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Search, Sparkles, Loader2, AlertTriangle, CheckCircle2 } from "lucide-react";

import { StatusBadge } from "./StatusBadge";
import { TablePager } from "./TablePager";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { getOriginalProduct, type OriginalProduct } from "@/app/projects/[id]/products/actions";
import { startProductRewrite, getRunProgress, type RunProgress } from "@/app/actions";

const TERMINAL = new Set(["SUCCEEDED", "PAUSED", "FAILED"]);

export interface ProductRow {
  handle: string;
  title: string;
  url: string;
  contentItemId: string | null;
  status: string | null;
  rewriteTitle: string | null;
  slug: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  primaryKeyword: string | null;
  secondaryKeywords: string[];
  rewrittenHtml: string | null;
  verifier: { verdict: string; isSelfCheck: boolean } | null;
  flags: { type: string; severity: string; note: string }[];
  versions: number;
  updatedAt: string | null;
  publishedUrl: string | null;
}

// Clean published-page typography for rendered HTML (mirrors the review preview look).
const ARTICLE_CSS =
  "max-w-none text-sm leading-relaxed [&_h1]:mb-2 [&_h1]:text-xl [&_h1]:font-bold [&_h2]:mt-5 [&_h2]:mb-1.5 [&_h2]:text-base [&_h2]:font-semibold [&_h3]:mt-4 [&_h3]:font-semibold [&_p]:my-2.5 [&_ul]:my-2.5 [&_ul]:space-y-1 [&_li]:ml-5 [&_li]:list-disc [&_strong]:font-semibold [&_a]:text-primary [&_a]:underline";

const FILTERS = [
  { key: "ALL", label: "All" },
  { key: "REWRITE", label: "Has rewrite" },
  { key: "PUBLISHED", label: "Published" },
  { key: "NONE", label: "No rewrite" },
] as const;

export default function ProductsTable({ slug, projectId, rows }: { slug: string; projectId: string; rows: ProductRow[] }) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<string>("ALL");
  const [openHandle, setOpenHandle] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 25;

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter === "REWRITE" && !r.contentItemId) return false;
      if (filter === "NONE" && r.contentItemId) return false;
      if (filter === "PUBLISHED" && r.status !== "PUBLISHED") return false;
      if (!needle) return true;
      return (r.title + " " + r.handle + " " + (r.primaryKeyword ?? "")).toLowerCase().includes(needle);
    });
  }, [rows, q, filter]);

  useEffect(() => setPage(1), [q, filter]); // reset to first page when the result set changes

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const open = rows.find((r) => r.handle === openHandle) ?? null;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search products…" className="w-64 pl-8" />
        </div>
        <div className="flex flex-wrap gap-1">
          {FILTERS.map((f) => (
            <Button key={f.key} size="sm" variant={filter === f.key ? "default" : "outline"} onClick={() => setFilter(f.key)}>{f.label}</Button>
          ))}
        </div>
        <span className="text-muted-foreground ml-auto text-xs">{filtered.length} of {rows.length}</span>
      </div>

      <div className="bg-card overflow-hidden rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead>Rewrite</TableHead>
              <TableHead>Primary keyword</TableHead>
              <TableHead>Updated</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageRows.map((r) => (
              <TableRow key={r.handle} onClick={() => setOpenHandle(r.handle)} className="cursor-pointer">
                <TableCell>
                  <div className="font-medium">{r.title}</div>
                  <div className="text-muted-foreground text-xs">{r.handle}</div>
                </TableCell>
                <TableCell>{r.status ? <StatusBadge status={r.status} /> : <span className="text-muted-foreground text-xs">none</span>}</TableCell>
                <TableCell className="text-muted-foreground">{r.primaryKeyword ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground text-xs">{r.updatedAt ? r.updatedAt.slice(0, 10) : "—"}</TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && <TableRow><TableCell colSpan={4} className="text-muted-foreground py-8 text-center">No products match.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>

      <TablePager page={safePage} pageCount={pageCount} total={filtered.length} pageSize={PAGE_SIZE} onPage={setPage} />

      <Sheet open={!!open} onOpenChange={(o) => !o && setOpenHandle(null)}>
        <SheetContent className="overflow-y-auto sm:max-w-3xl">
          {open && <Drawer slug={slug} projectId={projectId} row={open} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Drawer({ slug, projectId, row }: { slug: string; projectId: string; row: ProductRow }) {
  const router = useRouter();
  const [orig, setOrig] = useState<OriginalProduct | null>(null);
  const [loading, setLoading] = useState(true);

  // background per-product run + live chain-of-thought progress
  const [runId, setRunId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [progress, setProgress] = useState<RunProgress | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const refreshed = useRef(false);

  const running = starting || (!!progress && !TERMINAL.has(progress.status)) || (!!runId && !progress);

  const stopPoll = useCallback(() => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } }, []);

  useEffect(() => {
    if (!runId) return;
    let alive = true;
    const tick = async () => {
      const p = await getRunProgress(projectId, runId).catch(() => null);
      if (!alive || !p) return;
      setProgress(p);
      if (TERMINAL.has(p.status)) { stopPoll(); if (!refreshed.current) { refreshed.current = true; router.refresh(); } }
    };
    tick();
    pollRef.current = setInterval(tick, 2500);
    return () => { alive = false; stopPoll(); };
  }, [runId, projectId, router, stopPoll]);

  async function onGenerate() {
    if (running) return;
    setStarting(true); setStartError(null); setProgress(null); refreshed.current = false;
    try {
      const r = await startProductRewrite(projectId, row.handle);
      if (r.error) setStartError(r.error);
      else if (r.runId) setRunId(r.runId);
    } finally {
      setStarting(false);
    }
  }

  useEffect(() => {
    let alive = true;
    setLoading(true);
    getOriginalProduct(projectId, row.handle).then((r) => { if (alive) { setOrig(r); setLoading(false); } });
    return () => { alive = false; };
  }, [projectId, row.handle]);

  const hasRewrite = !!row.rewrittenHtml;
  const seoUrl = `${row.url.replace(/^https?:\/\//, "").split("/")[0]}/products/${row.handle}`;

  return (
    <>
      <SheetHeader>
        <SheetTitle className="pr-6 text-lg leading-tight">{row.rewriteTitle ?? row.title}</SheetTitle>
        <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs">
          {row.status ? <StatusBadge status={row.status} /> : <Badge variant="secondary">no rewrite</Badge>}
          <span>product rewrite</span>
          {row.versions > 0 && <span>· v{row.versions}</span>}
          <span>· {row.handle}</span>
        </div>
      </SheetHeader>

      <div className="space-y-5 p-4">
        {/* Action bar (mirrors the review toolbar) */}
        <div className="flex flex-wrap gap-2">
          {row.contentItemId && <Button size="sm" asChild><Link href={`/r/${slug}/product/${row.contentItemId}`}>Open in review →</Link></Button>}
          {!hasRewrite && (
            <Button size="sm" onClick={onGenerate} disabled={running}>
              {running ? <><Loader2 className="size-3.5 animate-spin" /> Generating…</> : <><Sparkles className="size-3.5" /> Generate rewrite</>}
            </Button>
          )}
          <Button size="sm" variant="outline" asChild><a href={row.url} target="_blank" rel="noreferrer">View product <ExternalLink className="size-3.5" /></a></Button>
          {row.publishedUrl && <Button size="sm" variant="outline" asChild><a href={row.publishedUrl} target="_blank" rel="noreferrer">View live <ExternalLink className="size-3.5" /></a></Button>}
        </div>

        {/* Grounding proof (mirrors review) */}
        {(row.verifier || row.flags.length > 0) && (
          <div className="bg-muted/40 rounded-lg border p-3 text-sm">
            {row.verifier && (
              <div>
                <span className="font-medium">Verifier:</span>{" "}
                <span className={row.verifier.verdict === "pass" ? "text-emerald-600" : "text-destructive"}>{row.verifier.verdict}</span>{" "}
                <span className="text-muted-foreground text-xs">({row.verifier.isSelfCheck ? "self-check" : "independent"})</span>
              </div>
            )}
            {row.flags.map((f, i) => (
              <div key={i} className="text-muted-foreground mt-1 text-xs"><b className="uppercase">{f.type} ({f.severity})</b> · {f.note}</div>
            ))}
          </div>
        )}

        {/* SEO snippet preview */}
        {hasRewrite && (row.metaTitle || row.metaDescription) && (
          <div className="rounded-lg border p-3">
            <div className="text-muted-foreground mb-1 text-[11px] tracking-wide uppercase">Search preview</div>
            <div className="text-xs text-emerald-700">{seoUrl}</div>
            <div className="text-base leading-snug text-[#1a0dab]">{row.metaTitle ?? row.rewriteTitle ?? row.title}</div>
            <div className="text-muted-foreground text-xs">{row.metaDescription ?? "—"}</div>
          </div>
        )}

        {/* Keywords */}
        {hasRewrite && (row.primaryKeyword || row.secondaryKeywords.length > 0) && (
          <div className="flex flex-wrap gap-1.5">
            {row.primaryKeyword && <Badge>{row.primaryKeyword}</Badge>}
            {row.secondaryKeywords.map((k) => <Badge key={k} variant="secondary">{k}</Badge>)}
          </div>
        )}

        {/* The piece — After / Before, rendered like the review preview */}
        <Tabs defaultValue={hasRewrite ? "after" : "before"}>
          <TabsList>
            <TabsTrigger value="after">After · Rankenstein</TabsTrigger>
            <TabsTrigger value="before">Before · live</TabsTrigger>
          </TabsList>

          <TabsContent value="after" className="mt-3">
            {hasRewrite ? (
              <article className={`bg-card rounded-lg border p-5 ${ARTICLE_CSS}`} dangerouslySetInnerHTML={{ __html: row.rewrittenHtml! }} />
            ) : running ? (
              <RunLog progress={progress} />
            ) : (
              <div className="space-y-3 rounded-lg border border-dashed p-6 text-center text-sm">
                <p className="text-muted-foreground">No rewrite yet for this product.</p>
                <Button onClick={onGenerate} disabled={running}>
                  <Sparkles className="size-4" /> Generate rewrite
                </Button>
                <p className="text-muted-foreground text-xs">Runs the full engine for this product: research → SERP ownership → ground → rewrite → AEO → guardrails → verify.</p>
                {startError && <p className="text-destructive flex items-center justify-center gap-1 text-xs"><AlertTriangle className="size-3.5" /> {startError}</p>}
                {progress && TERMINAL.has(progress.status) && progress.done === 0 && progress.flagged > 0 && (
                  <p className="flex items-center justify-center gap-1 text-xs text-amber-600"><AlertTriangle className="size-3.5" /> The verifier flagged this rewrite (ungrounded claims) — held out of review.</p>
                )}
              </div>
            )}
          </TabsContent>

          <TabsContent value="before" className="mt-3">
            {loading && <div className="text-muted-foreground text-sm">Loading from Shopify…</div>}
            {orig && !orig.ok && <div className="text-destructive text-sm">{orig.error}</div>}
            {orig && orig.ok && (
              <article className={`bg-muted/30 rounded-lg border p-5 ${ARTICLE_CSS}`} dangerouslySetInnerHTML={{ __html: orig.descriptionHtml || "<p class='text-muted-foreground'>(empty)</p>" }} />
            )}
          </TabsContent>
        </Tabs>

        <div className="text-muted-foreground text-xs">
          {row.updatedAt ? `Rewrite updated ${row.updatedAt.slice(0, 16).replace("T", " ")}` : ""}
        </div>
      </div>
    </>
  );
}

// Live chain-of-thought for an in-progress product run (mirrors the Overview run panel).
function RunLog({ progress }: { progress: RunProgress | null }) {
  const log = progress?.log ?? [];
  const done = !!progress && TERMINAL.has(progress.status);
  return (
    <div className="space-y-3 rounded-lg border p-4">
      {progress && (progress.done > 0 || progress.flagged > 0) && (
        <div className="flex flex-wrap gap-2 text-sm">
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-2.5 py-1"><CheckCircle2 className="size-4 text-emerald-600" /> {progress.done} ready</span>
          {progress.flagged > 0 && <span className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/5 px-2.5 py-1"><AlertTriangle className="size-4 text-amber-600" /> {progress.flagged} flagged</span>}
        </div>
      )}
      <div className="bg-muted/30 max-h-[45vh] space-y-2 overflow-y-auto rounded-lg border p-3 text-sm">
        {log.length === 0 && <div className="text-muted-foreground flex items-center gap-2"><Loader2 className="size-4 animate-spin" /> Starting the engine…</div>}
        {log.map((e, i) => {
          const last = i === log.length - 1;
          return (
            <div key={i} className="flex items-start gap-2">
              {!done && last ? <Loader2 className="text-primary mt-0.5 size-4 shrink-0 animate-spin" /> : <span className="bg-muted-foreground/40 mt-1.5 size-1.5 shrink-0 rounded-full" />}
              <span className={last && !done ? "text-foreground" : "text-muted-foreground"}>{e.message}</span>
            </div>
          );
        })}
      </div>
      <p className="text-muted-foreground text-xs">You can keep using the dashboard — the run continues in the background.</p>
    </div>
  );
}
