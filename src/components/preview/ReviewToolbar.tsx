"use client";

// The action bar above the canvas. Apply review is the headline: it runs the
// surgical editor and shows the PROOF — either "only the N commented spans
// changed" (green) or a refusal listing the untouched sections that moved (red,
// nothing written). Approve / email / rollback are plain server-action forms.

import { useActionState } from "react";
import { useRouter } from "next/navigation";

import type { ApplyReviewOutcome } from "@/app/review/actions";
import type { PublishOutcome, LiveRollbackOutcome } from "@/app/review/publish";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface Props {
  pieceId: string;
  status: string;
  openComments: number;
  versions: { version: number; note: string | null }[];
  publishedUrl?: string | null;
  applyReview: (formData: FormData) => Promise<ApplyReviewOutcome>;
  approve: (formData: FormData) => Promise<void>;
  requestEmailReview: (formData: FormData) => Promise<void>;
  rollback: (formData: FormData) => Promise<void>;
  publishToStore: (formData: FormData) => Promise<PublishOutcome>;
  rollbackLive: (formData: FormData) => Promise<LiveRollbackOutcome>;
}

export default function ReviewToolbar({ pieceId, status, openComments, versions, publishedUrl, applyReview, approve, requestEmailReview, rollback, publishToStore, rollbackLive }: Props) {
  const router = useRouter();
  const [outcome, runApply, applying] = useActionState<ApplyReviewOutcome | null, FormData>(
    async (_prev, fd) => {
      const r = await applyReview(fd);
      router.refresh();
      return r;
    },
    null,
  );
  const [pubOut, runPublish, publishing] = useActionState<PublishOutcome | null, FormData>(
    async (_prev, fd) => {
      const r = await publishToStore(fd);
      router.refresh();
      return r;
    },
    null,
  );
  const [rbOut, runRollbackLive, rollingBack] = useActionState<LiveRollbackOutcome | null, FormData>(
    async (_prev, fd) => {
      const r = await rollbackLive(fd);
      router.refresh();
      return r;
    },
    null,
  );

  const currentVersion = versions.length ? Math.max(...versions.map((v) => v.version)) : 1;

  return (
    <div className="mb-5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">{status.toLowerCase().replace("_", " ")}</Badge>
        <span className="text-muted-foreground text-xs">v{currentVersion}</span>
        <span className="flex-1" />

        <form action={runApply}>
          <input type="hidden" name="pieceId" value={pieceId} />
          <Button
            type="submit"
            disabled={applying || openComments === 0}
            title={openComments === 0 ? "Leave a comment first, then this rewrites only the commented spans" : "Rewrite only the commented spans, then prove nothing else changed"}
          >
            {applying ? "Applying…" : `Apply comments (${openComments})`}
          </Button>
        </form>

        <form action={requestEmailReview}>
          <input type="hidden" name="pieceId" value={pieceId} />
          <Button type="submit" variant="outline">Email for review</Button>
        </form>

        <form action={approve}>
          <input type="hidden" name="pieceId" value={pieceId} />
          <Button type="submit" className="bg-emerald-600 text-white hover:bg-emerald-600/90" disabled={status === "APPROVED" || status === "PUBLISHED"}>
            {status === "APPROVED" || status === "PUBLISHED" ? "Approved" : "Approve"}
          </Button>
        </form>

        {/* Live publish — only available once a human has APPROVED the piece. */}
        {status === "APPROVED" && (
          <form action={runPublish}>
            <input type="hidden" name="pieceId" value={pieceId} />
            <Button type="submit" disabled={publishing} title="Snapshot the live store, then push this approved rewrite to the storefront">
              {publishing ? "Publishing…" : "Publish to store"}
            </Button>
          </form>
        )}

        {/* Live rollback — re-push the pre-publish snapshot to the storefront. */}
        {status === "PUBLISHED" && (
          <form action={runRollbackLive}>
            <input type="hidden" name="pieceId" value={pieceId} />
            <Button type="submit" variant="outline" className="border-amber-500 text-amber-700" disabled={rollingBack} title="Restore the snapshot taken before publish to the live store">
              {rollingBack ? "Rolling back…" : "Roll back live"}
            </Button>
          </form>
        )}
      </div>

      {(status === "PENDING_REVIEW" || status === "CHANGES_REQUESTED") && (
        <p className="text-muted-foreground mt-2 text-xs">
          Highlight text to comment, then <b>Apply comments</b> to rewrite only those spans (you will see the before and after). <b>Approve</b> when you are happy.
        </p>
      )}

      {status === "PUBLISHED" && publishedUrl && (
        <div className="mt-3 rounded-lg border border-green-300 bg-green-50 p-3 text-sm text-green-900">
          <b>Published live.</b>{" "}
          <a href={publishedUrl} target="_blank" rel="noreferrer" className="underline">{publishedUrl}</a>
        </div>
      )}

      {pubOut && (
        <div className={`mt-3 rounded-lg border p-3 text-sm ${pubOut.ok ? "border-green-300 bg-green-50 text-green-900" : "border-red-300 bg-red-50 text-red-900"}`}>
          {pubOut.ok ? (
            <>
              <b>Published to the live store.</b> Pre-publish snapshot saved as v{pubOut.snapshotVersion} (one-click rollback ready).{" "}
              {pubOut.publishedUrl && <a href={pubOut.publishedUrl} target="_blank" rel="noreferrer" className="underline">View live</a>}
            </>
          ) : (
            <><b>Publish failed.</b> {pubOut.error}</>
          )}
        </div>
      )}

      {rbOut && (
        <div className={`mt-3 rounded-lg border p-3 text-sm ${rbOut.ok ? "border-green-300 bg-green-50 text-green-900" : "border-red-300 bg-red-50 text-red-900"}`}>
          {rbOut.ok ? <><b>Rolled back live.</b> Restored snapshot v{rbOut.restoredVersion} to the store.</> : <><b>Rollback failed.</b> {rbOut.error}</>}
        </div>
      )}

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

          {/* Per-comment outcome: each comment's fate (applied/override/no-change/
              skipped), so nothing silently no-ops. */}
          {outcome.edits && outcome.edits.length > 0 && (
            <div className="mt-3 space-y-2">
              {outcome.edits.map((e, i) => (
                <div key={i} className={`rounded border p-2 text-xs ${e.changed ? "bg-white/70" : "border-amber-200 bg-amber-50/50"}`}>
                  <div className="mb-1 flex items-center gap-2">
                    <span className={`rounded px-1.5 py-0.5 font-semibold ${e.changed ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
                      {e.reason === "override" ? "applied (your exact text)" : e.reason === "no-change" ? "no change" : e.reason === "skipped" ? "skipped" : e.reason === "error" ? "failed" : "applied"}
                    </span>
                    {!e.changed && e.note && <span className="text-amber-800">{e.note}</span>}
                  </div>
                  {e.changed ? (
                    <>
                      <div className="text-gray-500">before</div>
                      <div className="rounded bg-red-50 px-1.5 py-1 text-red-900 line-through decoration-red-400">{e.before || "(empty)"}</div>
                      <div className="mt-1 text-gray-500">after</div>
                      <div className="rounded bg-green-50 px-1.5 py-1 text-green-900">{e.after || "(removed)"}</div>
                    </>
                  ) : (
                    <div className="text-gray-600 italic">{`"${e.before.length > 80 ? e.before.slice(0, 79) + "…" : e.before}"`}</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {versions.length > 1 && (
        <details className="mt-3 text-sm">
          <summary className="text-muted-foreground cursor-pointer">Version history ({versions.length})</summary>
          <ul className="mt-2 space-y-1">
            {[...versions]
              .sort((a, b) => b.version - a.version)
              .map((v) => (
                <li key={v.version} className="flex items-center gap-2">
                  <span className="text-muted-foreground font-mono text-xs">v{v.version}</span>
                  <span className="text-muted-foreground flex-1 truncate">{v.note ?? ""}</span>
                  {v.version !== currentVersion && (
                    <form action={rollback}>
                      <input type="hidden" name="pieceId" value={pieceId} />
                      <input type="hidden" name="version" value={v.version} />
                      <Button type="submit" variant="link" size="sm" className="h-auto p-0 text-amber-700">restore</Button>
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
