"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Search, Sparkles, Loader2, AlertTriangle } from "lucide-react";

import { StatusBadge } from "./StatusBadge";
import { TablePager } from "./TablePager";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { getOriginalProduct, type OriginalProduct } from "@/app/projects/[id]/products/actions";
import { generateProductRewrite, type GenProductResult } from "@/app/actions";

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

  const [gen, dispatchGen, generating] = useActionState<GenProductResult | null, FormData>(
    async (_prev, fd) => {
      const r = await generateProductRewrite(fd);
      router.refresh(); // pull the new rewrite into the row behind the drawer
      return r;
    },
    null,
  );

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
            <form action={dispatchGen}>
              <input type="hidden" name="projectId" value={projectId} />
              <input type="hidden" name="handle" value={row.handle} />
              <Button size="sm" type="submit" disabled={generating}>
                {generating ? <><Loader2 className="size-3.5 animate-spin" /> Generating… ~1 min</> : <><Sparkles className="size-3.5" /> Generate rewrite</>}
              </Button>
            </form>
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
            ) : (
              <div className="space-y-3 rounded-lg border border-dashed p-6 text-center text-sm">
                <p className="text-muted-foreground">No rewrite yet for this product.</p>
                <form action={dispatchGen} className="flex justify-center">
                  <input type="hidden" name="projectId" value={projectId} />
                  <input type="hidden" name="handle" value={row.handle} />
                  <Button type="submit" disabled={generating}>
                    {generating ? <><Loader2 className="size-4 animate-spin" /> Generating… ~1 min</> : <><Sparkles className="size-4" /> Generate rewrite</>}
                  </Button>
                </form>
                {generating && <p className="text-muted-foreground text-xs">Running the engine for this product (research → ground → rewrite → verify).</p>}
                {gen?.error && <p className="text-destructive flex items-center justify-center gap-1 text-xs"><AlertTriangle className="size-3.5" /> {gen.error}</p>}
                {gen && !gen.error && gen.done === 0 && gen.flagged > 0 && (
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
