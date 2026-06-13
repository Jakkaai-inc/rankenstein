"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ExternalLink, Search } from "lucide-react";

import { StatusBadge } from "./StatusBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

export interface ContentRow {
  id: string;
  title: string;
  status: string;
  kind: string;
  primaryKeyword: string | null;
  secondaryKeywords: string[];
  sourceRef: string | null;
  updatedAt: string;
  publishedUrl: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  html: string;
  verifier: { verdict: string; isSelfCheck: boolean } | null;
  versions: number;
}

const FILTERS = ["ALL", "PENDING_REVIEW", "APPROVED", "PUBLISHED", "FAILED"] as const;

export default function ContentTable({ rows }: { rows: ContentRow[] }) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<string>("ALL");
  const [openId, setOpenId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter !== "ALL" && r.status !== filter) return false;
      if (!needle) return true;
      return (r.title + " " + (r.primaryKeyword ?? "") + " " + (r.sourceRef ?? "")).toLowerCase().includes(needle);
    });
  }, [rows, q, filter]);

  const open = rows.find((r) => r.id === openId) ?? null;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search content…" className="w-64 pl-8" />
        </div>
        <div className="flex flex-wrap gap-1">
          {FILTERS.map((f) => (
            <Button key={f} size="sm" variant={filter === f ? "default" : "outline"} onClick={() => setFilter(f)}>
              {f === "ALL" ? "All" : f.toLowerCase().replace(/_/g, " ")}
            </Button>
          ))}
        </div>
        <span className="text-muted-foreground ml-auto text-xs">{filtered.length} of {rows.length}</span>
      </div>

      <div className="bg-card overflow-hidden rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Primary keyword</TableHead>
              <TableHead>Updated</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((r) => (
              <TableRow key={r.id} onClick={() => setOpenId(r.id)} className="cursor-pointer">
                <TableCell className="font-medium">{r.title}</TableCell>
                <TableCell><StatusBadge status={r.status} /></TableCell>
                <TableCell className="text-muted-foreground">{r.primaryKeyword ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground text-xs">{r.updatedAt.slice(0, 16).replace("T", " ")}</TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow><TableCell colSpan={4} className="text-muted-foreground py-8 text-center">No content matches.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Sheet open={!!open} onOpenChange={(o) => !o && setOpenId(null)}>
        <SheetContent className="overflow-y-auto sm:max-w-2xl">
          {open && (
            <>
              <SheetHeader>
                <SheetTitle className="pr-6 text-lg">{open.title}</SheetTitle>
                <div className="flex items-center gap-2">
                  <StatusBadge status={open.status} />
                  <span className="text-muted-foreground text-xs">{open.kind === "PRODUCT_REWRITE" ? "product rewrite" : "article"} · v{open.versions}</span>
                </div>
              </SheetHeader>
              <div className="space-y-5 p-4">
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" asChild><Link href={`/review/${open.id}`}>Open in review →</Link></Button>
                  {open.publishedUrl && <Button size="sm" variant="outline" asChild><a href={open.publishedUrl} target="_blank" rel="noreferrer">View live <ExternalLink className="size-3.5" /></a></Button>}
                </div>

                <Field label="Keywords used">
                  <div className="flex flex-wrap gap-1.5">
                    {open.primaryKeyword && <Badge>{open.primaryKeyword}</Badge>}
                    {open.secondaryKeywords.map((k) => <Badge key={k} variant="secondary">{k}</Badge>)}
                    {!open.primaryKeyword && open.secondaryKeywords.length === 0 && <span className="text-muted-foreground text-sm">—</span>}
                  </div>
                </Field>

                {open.verifier && (
                  <Field label="Verifier">
                    <span className={open.verifier.verdict === "pass" ? "text-emerald-600" : "text-destructive"}>{open.verifier.verdict}</span>{" "}
                    <span className="text-muted-foreground text-xs">({open.verifier.isSelfCheck ? "self-check" : "independent"})</span>
                  </Field>
                )}

                <Field label="SEO">
                  <div className="text-sm font-medium">{open.metaTitle ?? open.title}</div>
                  <div className="text-muted-foreground text-xs">{open.metaDescription ?? "—"}</div>
                </Field>

                <Field label="Rewritten content">
                  <div className="bg-muted/40 max-h-[50vh] overflow-y-auto rounded-lg border p-3 text-sm [&_h2]:mt-3 [&_h2]:font-semibold [&_li]:ml-4 [&_li]:list-disc [&_p]:my-1.5" dangerouslySetInnerHTML={{ __html: open.html }} />
                </Field>

                <div className="text-muted-foreground text-xs">Last updated {open.updatedAt.slice(0, 16).replace("T", " ")}{open.sourceRef ? ` · source: ${open.sourceRef}` : ""}</div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-muted-foreground mb-1 text-xs font-semibold tracking-wide uppercase">{label}</div>
      {children}
    </div>
  );
}
