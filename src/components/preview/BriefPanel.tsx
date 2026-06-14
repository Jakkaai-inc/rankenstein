// Read-only "content brief" panel for the review canvas — the engine's
// research story above the draft, mirroring inputs/reference-output-minky-preview.html
// section 1 (keyword map with roles + exclusions) and the process-honesty line.
//
// Rendered from the stored ContentBrief (what the DB has at review time); it is
// NOT commentable and NOT the publishable body — it is context for the reviewer.
// Hyphens only (em-dash rule applies to review chrome).

import type { ContentBrief } from "@/types/contracts";

function fmt(n: number | null): string {
  return n === null || n === undefined ? "n/a" : n.toLocaleString();
}

export default function BriefPanel({ brief }: { brief: ContentBrief | null }) {
  if (!brief) return null;
  const primary = brief.primaryKeyword;
  const secondaries = brief.secondaryKeywords ?? [];
  const exclusions = brief.exclusions ?? [];

  return (
    <details className="bg-card rounded-xl border text-sm">
      <summary className="cursor-pointer px-4 py-2 font-medium">
        Content brief · keywords, SERP, process
      </summary>
      <div className="space-y-4 px-4 pb-4">
        {/* Process-honesty line (RUBRIC A6). */}
        <p className="text-muted-foreground text-xs">
          Keyword data: {brief.keywordDataSource === "provider-verified" ? "provider-verified" : "web-estimate"} ·
          word target {brief.wordTarget} / {brief.wordCount} written ·
          history: {brief.historyDecision}
        </p>

        {/* Keyword map: primary + secondaries with role + volume/KD. */}
        <div>
          <div className="text-muted-foreground mb-1 text-xs font-semibold uppercase tracking-wide">Keyword map</div>
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="text-muted-foreground text-left">
                <th className="border-b py-1 pr-2 font-medium">Keyword</th>
                <th className="border-b py-1 pr-2 text-right font-medium">Vol/mo</th>
                <th className="border-b py-1 pr-2 text-right font-medium">KD</th>
                <th className="border-b py-1 font-medium">Role</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border-b py-1 pr-2 font-medium">{primary.keyword}</td>
                <td className="border-b py-1 pr-2 text-right tabular-nums">{fmt(primary.volume)}</td>
                <td className="border-b py-1 pr-2 text-right tabular-nums">{fmt(primary.kd)}</td>
                <td className="border-b py-1"><span className="rounded bg-[#b5651d] px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">Primary</span></td>
              </tr>
              {secondaries.map((s, i) => (
                <tr key={i}>
                  <td className="border-b py-1 pr-2">{s.keyword}</td>
                  <td className="border-b py-1 pr-2 text-right tabular-nums">{fmt(s.volume)}</td>
                  <td className="border-b py-1 pr-2 text-right tabular-nums">-</td>
                  <td className="border-b py-1"><span className="rounded bg-[#ede7dc] px-1.5 py-0.5 text-[10px] font-bold uppercase text-[#6b5836]">Secondary</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* SERP ownership note. */}
        {brief.serpOwnershipNote && (
          <div>
            <div className="text-muted-foreground mb-1 text-xs font-semibold uppercase tracking-wide">SERP ownership</div>
            <p className="text-xs">{brief.serpOwnershipNote}</p>
          </div>
        )}

        {/* Exclusions (cannibalization control). */}
        {exclusions.length > 0 && (
          <div>
            <div className="text-muted-foreground mb-1 text-xs font-semibold uppercase tracking-wide">Excluded by design</div>
            <ul className="space-y-0.5 text-xs">
              {exclusions.map((e, i) => (
                <li key={i}><b>{e.keyword}</b> <span className="text-muted-foreground">- {e.reason}</span></li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </details>
  );
}
