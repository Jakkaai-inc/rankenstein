"use client";

// Review queue as the SAME table used elsewhere in the dashboard (built on the
// shared ui/table + StatusBadge + TablePager primitives), with a Type column that
// distinguishes product rewrites from new vs refreshed articles. A row opens the
// review page (where the reviewer comments, sends feedback, and approves).
// Flagged (FAILED) pieces stay visible for triage — the brief requires they are
// never hidden.

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";

import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { TablePager } from "@/components/dashboard/TablePager";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export interface ReviewRow {
  id: string;
  title: string | null;
  kind: string; // PRODUCT_REWRITE | ARTICLE
  action: string; // CREATE | REFRESH | ...
  status: string;
  primaryKeyword: string | null;
  comments: number;
  updatedAt: string;
}

// kind + action -> a human content type for the Type column.
export function contentTypeLabel(kind: string, action: string): string {
  if (kind === "PRODUCT_REWRITE") return "Product rewrite";
  if (kind === "ARTICLE") return action === "CREATE" ? "New article" : "Article rewrite";
  return kind.toLowerCase().replace(/_/g, " ");
}

function typeVariant(kind: string, action: string): React.ComponentProps<typeof Badge>["variant"] {
  if (kind === "PRODUCT_REWRITE") return "secondary";
  return action === "CREATE" ? "info" : "warning";
}

const FILTERS = ["ALL", "PENDING_REVIEW", "CHANGES_REQUESTED", "APPROVED", "PUBLISHED", "FAILED"] as const;

export default function ReviewTable({ slug, rows }: { slug: string; rows: ReviewRow[] }) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<string>("ALL");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 12;

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter !== "ALL" && r.status !== filter) return false;
      if (!needle) return true;
      return ((r.title ?? "") + " " + (r.primaryKeyword ?? "") + " " + contentTypeLabel(r.kind, r.action)).toLowerCase().includes(needle);
    });
  }, [rows, q, filter]);

  useEffect(() => setPage(1), [q, filter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search review queue…" className="w-64 pl-8" />
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
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Primary keyword</TableHead>
              <TableHead>Comments</TableHead>
              <TableHead>Updated</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageRows.map((r) => {
              const href = `/r/${slug}/${r.kind === "ARTICLE" ? "article" : "product"}/${r.id}`;
              return (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">
                    <Link href={href} className="hover:underline">{r.title ?? "Untitled"}</Link>
                  </TableCell>
                  <TableCell><Badge variant={typeVariant(r.kind, r.action)}>{contentTypeLabel(r.kind, r.action)}</Badge></TableCell>
                  <TableCell><StatusBadge status={r.status} /></TableCell>
                  <TableCell className="text-muted-foreground">{r.primaryKeyword ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{r.comments > 0 ? r.comments : "—"}</TableCell>
                  <TableCell className="text-muted-foreground text-xs">{r.updatedAt.slice(0, 16).replace("T", " ")}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant={r.status === "FAILED" ? "outline" : "default"} asChild>
                      <Link href={href}>{r.status === "FAILED" ? "Triage" : r.status === "APPROVED" || r.status === "PUBLISHED" ? "Open" : "Review"} →</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
            {filtered.length === 0 && (
              <TableRow><TableCell colSpan={7} className="text-muted-foreground py-8 text-center">Nothing matches.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <TablePager page={safePage} pageCount={pageCount} total={filtered.length} pageSize={PAGE_SIZE} onPage={setPage} />
    </div>
  );
}
