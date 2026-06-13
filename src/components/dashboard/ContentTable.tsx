"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { StatusBadge } from "./StatusBadge";

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
    <div className="relative">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search content…"
          className="w-64 rounded-md border px-3 py-1.5 text-sm"
        />
        <div className="flex gap-1">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-md px-2.5 py-1.5 text-xs font-medium ${filter === f ? "bg-gray-900 text-white" : "bg-white text-gray-600 hover:bg-gray-100 border"}`}
            >
              {f === "ALL" ? "All" : f.toLowerCase().replace(/_/g, " ")}
            </button>
          ))}
        </div>
        <span className="ml-auto text-xs text-gray-400">{filtered.length} of {rows.length}</span>
      </div>

      <div className="overflow-hidden rounded-xl border bg-white">
        <table className="w-full text-sm">
          <thead className="border-b bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-2.5 font-medium">Title</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
              <th className="px-4 py-2.5 font-medium">Primary keyword</th>
              <th className="px-4 py-2.5 font-medium">Updated</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.map((r) => (
              <tr key={r.id} onClick={() => setOpenId(r.id)} className="cursor-pointer hover:bg-gray-50">
                <td className="px-4 py-2.5 font-medium">{r.title}</td>
                <td className="px-4 py-2.5"><StatusBadge status={r.status} /></td>
                <td className="px-4 py-2.5 text-gray-600">{r.primaryKeyword ?? "—"}</td>
                <td className="px-4 py-2.5 text-xs text-gray-400">{r.updatedAt.slice(0, 16).replace("T", " ")}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400">No content matches.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {open && <Drawer row={open} onClose={() => setOpenId(null)} />}
    </div>
  );
}

function Drawer({ row, onClose }: { row: ContentRow; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-40 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/20" />
      <aside className="relative z-50 h-full w-full max-w-2xl overflow-y-auto bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 flex items-start justify-between border-b bg-white px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-bold">{row.title}</h2>
            <div className="mt-1 flex items-center gap-2">
              <StatusBadge status={row.status} />
              <span className="text-xs text-gray-400">{row.kind === "PRODUCT_REWRITE" ? "product rewrite" : "article"} · v{row.versions}</span>
            </div>
          </div>
          <button onClick={onClose} className="rounded p-1 text-gray-400 hover:bg-gray-100">✕</button>
        </div>

        <div className="space-y-5 p-5">
          <div className="flex flex-wrap gap-2">
            <Link href={`/review/${row.id}`} className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white">Open in review →</Link>
            {row.publishedUrl && <a href={row.publishedUrl} target="_blank" rel="noreferrer" className="rounded-md border px-3 py-1.5 text-sm text-blue-700">View live ↗</a>}
          </div>

          <Field label="Keywords used">
            <div className="flex flex-wrap gap-1.5">
              {row.primaryKeyword && <span className="rounded bg-gray-900 px-2 py-0.5 text-xs text-white">{row.primaryKeyword}</span>}
              {row.secondaryKeywords.map((k) => <span key={k} className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-700">{k}</span>)}
              {!row.primaryKeyword && row.secondaryKeywords.length === 0 && <span className="text-sm text-gray-400">—</span>}
            </div>
          </Field>

          {row.verifier && (
            <Field label="Verifier">
              <span className={row.verifier.verdict === "pass" ? "text-green-700" : "text-red-700"}>{row.verifier.verdict}</span>{" "}
              <span className="text-xs text-gray-500">({row.verifier.isSelfCheck ? "self-check" : "independent"})</span>
            </Field>
          )}

          <Field label="SEO">
            <div className="text-sm"><b>{row.metaTitle ?? row.title}</b></div>
            <div className="text-xs text-gray-500">{row.metaDescription ?? "—"}</div>
          </Field>

          <Field label="Rewritten content">
            <div className="prose-sm max-h-[50vh] overflow-y-auto rounded-lg border bg-gray-50 p-3 text-sm [&_h2]:mt-3 [&_h2]:font-semibold [&_li]:ml-4 [&_li]:list-disc [&_p]:my-1.5" dangerouslySetInnerHTML={{ __html: row.html }} />
          </Field>

          <div className="text-xs text-gray-400">Last updated {row.updatedAt.slice(0, 16).replace("T", " ")}{row.sourceRef ? ` · source: ${row.sourceRef}` : ""}</div>
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
