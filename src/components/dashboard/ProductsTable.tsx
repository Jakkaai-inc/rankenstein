"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { StatusBadge } from "./StatusBadge";
import { getOriginalProduct, type OriginalProduct } from "@/app/projects/[id]/products/actions";

export interface ProductRow {
  handle: string;
  title: string;
  url: string;
  // matched Rankenstein rewrite (if any)
  contentItemId: string | null;
  status: string | null;
  primaryKeyword: string | null;
  secondaryKeywords: string[];
  rewrittenHtml: string | null;
  updatedAt: string | null;
  publishedUrl: string | null;
}

const FILTERS = [
  { key: "ALL", label: "All" },
  { key: "REWRITE", label: "Has rewrite" },
  { key: "PUBLISHED", label: "Published" },
  { key: "NONE", label: "No rewrite" },
] as const;

export default function ProductsTable({ projectId, rows }: { projectId: string; rows: ProductRow[] }) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<string>("ALL");
  const [openHandle, setOpenHandle] = useState<string | null>(null);

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

  const open = rows.find((r) => r.handle === openHandle) ?? null;

  return (
    <div className="relative">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search products…" className="w-64 rounded-md border px-3 py-1.5 text-sm" />
        <div className="flex gap-1">
          {FILTERS.map((f) => (
            <button key={f.key} onClick={() => setFilter(f.key)} className={`rounded-md px-2.5 py-1.5 text-xs font-medium ${filter === f.key ? "bg-gray-900 text-white" : "border bg-white text-gray-600 hover:bg-gray-100"}`}>
              {f.label}
            </button>
          ))}
        </div>
        <span className="ml-auto text-xs text-gray-400">{filtered.length} of {rows.length}</span>
      </div>

      <div className="overflow-hidden rounded-xl border bg-white">
        <table className="w-full text-sm">
          <thead className="border-b bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-2.5 font-medium">Product</th>
              <th className="px-4 py-2.5 font-medium">Rewrite</th>
              <th className="px-4 py-2.5 font-medium">Primary keyword</th>
              <th className="px-4 py-2.5 font-medium">Updated</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.slice(0, 400).map((r) => (
              <tr key={r.handle} onClick={() => setOpenHandle(r.handle)} className="cursor-pointer hover:bg-gray-50">
                <td className="px-4 py-2.5">
                  <div className="font-medium">{r.title}</div>
                  <div className="text-xs text-gray-400">{r.handle}</div>
                </td>
                <td className="px-4 py-2.5">{r.status ? <StatusBadge status={r.status} /> : <span className="text-xs text-gray-400">none</span>}</td>
                <td className="px-4 py-2.5 text-gray-600">{r.primaryKeyword ?? "—"}</td>
                <td className="px-4 py-2.5 text-xs text-gray-400">{r.updatedAt ? r.updatedAt.slice(0, 10) : "—"}</td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400">No products match.</td></tr>}
          </tbody>
        </table>
        {filtered.length > 400 && <div className="border-t px-4 py-2 text-center text-xs text-gray-400">Showing first 400 — refine your search.</div>}
      </div>

      {open && <Drawer projectId={projectId} row={open} onClose={() => setOpenHandle(null)} />}
    </div>
  );
}

function Drawer({ projectId, row, onClose }: { projectId: string; row: ProductRow; onClose: () => void }) {
  const [orig, setOrig] = useState<OriginalProduct | null>(null);
  const [loading, setLoading] = useState(true);

  // lazy-load the live original from the store when the drawer opens
  useEffect(() => {
    let alive = true;
    setLoading(true);
    getOriginalProduct(projectId, row.handle).then((r) => { if (alive) { setOrig(r); setLoading(false); } });
    return () => { alive = false; };
  }, [projectId, row.handle]);

  return (
    <div className="fixed inset-0 z-40 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/20" />
      <aside className="relative z-50 h-full w-full max-w-3xl overflow-y-auto bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 flex items-start justify-between border-b bg-white px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-bold">{row.title}</h2>
            <div className="mt-1 flex items-center gap-2 text-xs text-gray-400">
              <span>{row.handle}</span>
              {row.status && <StatusBadge status={row.status} />}
            </div>
          </div>
          <button onClick={onClose} className="rounded p-1 text-gray-400 hover:bg-gray-100">✕</button>
        </div>

        <div className="space-y-5 p-5">
          <div className="flex flex-wrap gap-2">
            <a href={row.url} target="_blank" rel="noreferrer" className="rounded-md border px-3 py-1.5 text-sm text-blue-700">View product ↗</a>
            {row.contentItemId && <Link href={`/review/${row.contentItemId}`} className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white">Open rewrite in review →</Link>}
          </div>

          {row.contentItemId && (
            <Field label="Keywords used">
              <div className="flex flex-wrap gap-1.5">
                {row.primaryKeyword && <span className="rounded bg-gray-900 px-2 py-0.5 text-xs text-white">{row.primaryKeyword}</span>}
                {row.secondaryKeywords.map((k) => <span key={k} className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-700">{k}</span>)}
              </div>
            </Field>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Original (live on store)">
              {loading && <div className="text-sm text-gray-400">Loading from Shopify…</div>}
              {orig && !orig.ok && <div className="text-sm text-red-600">{orig.error}</div>}
              {orig && orig.ok && (
                <div className="prose-sm max-h-[55vh] overflow-y-auto rounded-lg border bg-gray-50 p-3 text-sm [&_li]:ml-4 [&_li]:list-disc [&_p]:my-1.5" dangerouslySetInnerHTML={{ __html: orig.descriptionHtml || "<span class='text-gray-400'>(empty)</span>" }} />
              )}
            </Field>

            <Field label="Rewritten (Rankenstein)">
              {row.rewrittenHtml ? (
                <div className="prose-sm max-h-[55vh] overflow-y-auto rounded-lg border border-green-200 bg-green-50/40 p-3 text-sm [&_h2]:mt-3 [&_h2]:font-semibold [&_li]:ml-4 [&_li]:list-disc [&_p]:my-1.5" dangerouslySetInnerHTML={{ __html: row.rewrittenHtml }} />
              ) : (
                <div className="rounded-lg border border-dashed p-4 text-sm text-gray-400">No rewrite yet. Generate a batch to create one.</div>
              )}
            </Field>
          </div>

          <div className="text-xs text-gray-400">
            {row.updatedAt ? `Rewrite updated ${row.updatedAt.slice(0, 16).replace("T", " ")}` : "No rewrite yet"}
            {row.publishedUrl && <> · <a href={row.publishedUrl} target="_blank" rel="noreferrer" className="text-blue-600 underline">published live ↗</a></>}
          </div>
        </div>
      </aside>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</div>
      {children}
    </div>
  );
}
