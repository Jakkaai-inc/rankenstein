"use client";

// The action bar above the canvas. Apply review is the headline: it runs the
// surgical editor and shows the PROOF — either "only the N commented spans
// changed" (green) or a refusal listing the untouched sections that moved (red,
// nothing written). Approve / email / rollback are plain server-action forms.

import { useActionState } from "react";
import { useRouter } from "next/navigation";

import type { ApplyReviewOutcome } from "@/app/review/actions";

interface Props {
  pieceId: string;
  status: string;
  openComments: number;
  versions: { version: number; note: string | null }[];
  applyReview: (formData: FormData) => Promise<ApplyReviewOutcome>;
  approve: (formData: FormData) => Promise<void>;
  requestEmailReview: (formData: FormData) => Promise<void>;
  rollback: (formData: FormData) => Promise<void>;
}

export default function ReviewToolbar({ pieceId, status, openComments, versions, applyReview, approve, requestEmailReview, rollback }: Props) {
  const router = useRouter();
  const [outcome, runApply, applying] = useActionState<ApplyReviewOutcome | null, FormData>(
    async (_prev, fd) => {
      const r = await applyReview(fd);
      router.refresh();
      return r;
    },
    null,
  );

  const currentVersion = versions.length ? Math.max(...versions.map((v) => v.version)) : 1;

  return (
    <div className="mb-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-700">{status.toLowerCase().replace("_", " ")}</span>
        <span className="text-xs text-gray-400">v{currentVersion}</span>
        <span className="flex-1" />

        <form action={runApply}>
          <input type="hidden" name="pieceId" value={pieceId} />
          <button
            className="rounded-md bg-[#b5651d] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            disabled={applying || openComments === 0}
            title={openComments === 0 ? "No open comments to apply" : "Rewrite only the commented spans, then prove nothing else changed"}
          >
            {applying ? "Applying…" : `Apply review (${openComments})`}
          </button>
        </form>

        <form action={requestEmailReview}>
          <input type="hidden" name="pieceId" value={pieceId} />
          <button className="rounded-md border px-4 py-2 text-sm font-medium">Email for review</button>
        </form>

        <form action={approve}>
          <input type="hidden" name="pieceId" value={pieceId} />
          <button className="rounded-md bg-green-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={status === "APPROVED"}>
            {status === "APPROVED" ? "Approved" : "Approve"}
          </button>
        </form>
      </div>

      {outcome && (
        <div className={`mt-3 rounded-lg border p-3 text-sm ${outcome.ok ? "border-green-300 bg-green-50 text-green-900" : "border-red-300 bg-red-50 text-red-900"}`}>
          {outcome.ok ? (
            <>
              <b>Surgical edit verified.</b> {outcome.applied} commented span(s) rewritten; an independent diff confirmed nothing else changed. Saved as v{outcome.newVersion}.
            </>
          ) : outcome.untouchedSectionsChanged.length ? (
            <>
              <b>Refused — not surgical.</b> The edit would have changed uncommented sections, so nothing was written:
              <ul className="mt-1 list-disc pl-5">
                {outcome.untouchedSectionsChanged.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </>
          ) : (
            <>{outcome.error ?? "Nothing applied."}</>
          )}
        </div>
      )}

      {versions.length > 1 && (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-gray-500">Version history ({versions.length})</summary>
          <ul className="mt-2 space-y-1">
            {[...versions]
              .sort((a, b) => b.version - a.version)
              .map((v) => (
                <li key={v.version} className="flex items-center gap-2">
                  <span className="font-mono text-xs text-gray-500">v{v.version}</span>
                  <span className="flex-1 truncate text-gray-600">{v.note ?? ""}</span>
                  {v.version !== currentVersion && (
                    <form action={rollback}>
                      <input type="hidden" name="pieceId" value={pieceId} />
                      <input type="hidden" name="version" value={v.version} />
                      <button className="text-xs text-amber-700 hover:underline">restore</button>
                    </form>
                  )}
                </li>
              ))}
          </ul>
        </details>
      )}
    </div>
  );
}
