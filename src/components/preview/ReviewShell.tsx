"use client";

// The reviewer's canvas, redesigned around a simple loop:
//   pick a version  ->  read it  ->  leave Google-Docs-style comments  ->
//   Send feedback (freezes the view, AI rewrites the commented spans, the
//   version auto-advances)  ->  repeat, or Approve to publish.
//
// State-dependent primary CTA:
//   - no open comments  -> "Approve to publish" (+ Close)
//   - >= 1 open comment -> "Send feedback"
// Old versions are read-only: you can view/compare any version, but commenting
// and the CTAs only act on the latest. The verifier/guardrail panel is collapsed
// by default (it read like developer output) but one click away.

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import type { ContentBrief, CommentAnchor, GuardrailFlag, ReviewComment, VerifierVerdict } from "@/types/contracts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import PiecePreview, { type NewCommentInput, type PiecePreviewMeta } from "./PiecePreview";
import BriefPanel from "./BriefPanel";
import type { VersionContent } from "@/app/review/actions";
import { rollback } from "@/app/review/actions";

export interface ReviewShellVersion {
  version: number;
  note: string | null;
}

interface EditOutcome {
  commentId: string;
  before: string;
  after: string;
  changed: boolean;
  reason: string; // applied | override | no-change | skipped | error
  note?: string;
}

const REASON_LABEL: Record<string, string> = {
  applied: "applied",
  override: "applied (your exact text)",
  "no-change": "no change",
  skipped: "skipped",
  error: "failed",
};

interface Props {
  pieceId: string;
  status: string;
  meta: PiecePreviewMeta;
  latestVersion: number;
  latestHtml: string;
  versions: ReviewShellVersion[]; // descending
  comments: ReviewComment[]; // open comments on the latest version
  flags: GuardrailFlag[];
  verdict: VerifierVerdict | null;
  brief?: ContentBrief | null; // engine research story (read-only context panel)
  publishedUrl?: string | null;
  // server actions / wiring
  addComment: (input: NewCommentInput) => Promise<void>;
  approve: (formData: FormData) => Promise<void>;
  getVersionContent: (pieceId: string, version: number) => Promise<VersionContent>;
  publishToStore?: (formData: FormData) => Promise<{ ok: boolean; error?: string; publishedUrl?: string | null }>;
}

type PollState = "idle" | "rewriting" | "done" | "error";

export default function ReviewShell(props: Props) {
  const { pieceId, status, meta, latestVersion, latestHtml, versions, comments, flags, verdict, brief, publishedUrl } = props;
  const router = useRouter();

  const [selected, setSelected] = useState(latestVersion);
  const [view, setView] = useState<{ html: string; isLatest: boolean }>({ html: latestHtml, isLatest: true });
  const [loadingVersion, startLoad] = useTransition();

  const [poll, setPoll] = useState<PollState>("idle");
  const [systemMsg, setSystemMsg] = useState<string | null>(null);
  const [outcomeEdits, setOutcomeEdits] = useState<EditOutcome[] | null>(null);
  const [showChecks, setShowChecks] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishErr, setPublishErr] = useState<string | null>(null);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep the view in sync when the server passes a newer latest (e.g. after a
  // rewrite + router.refresh) and we are pinned to latest.
  useEffect(() => {
    if (selected === latestVersion) {
      setSelected(latestVersion);
      setView({ html: latestHtml, isLatest: true });
    }
  }, [latestVersion, latestHtml]); // eslint-disable-line react-hooks/exhaustive-deps

  const onSelectVersion = useCallback(
    (v: number) => {
      setSelected(v);
      if (v === latestVersion) {
        setView({ html: latestHtml, isLatest: true });
        return;
      }
      startLoad(async () => {
        const vc = await props.getVersionContent(pieceId, v);
        setView({ html: vc.html, isLatest: vc.isLatest });
      });
    },
    [latestVersion, latestHtml, pieceId, props],
  );

  const onLatest = view.isLatest;
  const openComments = comments.length;

  // ── Send feedback: freeze, kick the rewrite, poll until a new version lands ──
  const startPolling = useCallback(
    (since: number) => {
      const tick = async () => {
        try {
          const r = await fetch(`/r/api/feedback/status?pieceId=${pieceId}&since=${since}`, { cache: "no-store" });
          const data = await r.json();
          if (data.state === "done") {
            setPoll("done");
            setSystemMsg(data.message ?? `Your feedback was accepted. Updated to v${data.version}.`);
            setOutcomeEdits(data.outcome?.edits ?? null);
            setSelected(data.version);
            router.refresh(); // pull the new latest + reset open comments
            return;
          }
          if (data.state === "error") {
            setPoll("error");
            setSystemMsg(data.message ?? "The rewrite did not change anything. Try rephrasing your comment.");
            setOutcomeEdits(data.outcome?.edits ?? null);
            router.refresh();
            return;
          }
        } catch {
          /* transient — keep polling */
        }
        pollTimer.current = setTimeout(tick, 1500);
      };
      pollTimer.current = setTimeout(tick, 1200);
    },
    [pieceId, router],
  );

  const sendFeedback = useCallback(async () => {
    if (!onLatest || openComments === 0 || poll === "rewriting") return;
    setSystemMsg(null);
    setPoll("rewriting");
    const since = latestVersion;
    // Fire the job. The route runs the rewrite to completion; we also poll so the
    // freeze lifts even if this fetch is interrupted.
    fetch("/r/api/feedback", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pieceId }),
    }).catch(() => {});
    startPolling(since);
  }, [onLatest, openComments, poll, latestVersion, pieceId, startPolling]);

  useEffect(() => () => { if (pollTimer.current) clearTimeout(pollTimer.current); }, []);

  const doApprove = useCallback(() => {
    const fd = new FormData();
    fd.set("pieceId", pieceId);
    startLoad(async () => {
      await props.approve(fd);
      router.refresh();
    });
  }, [pieceId, props, router]);

  const doPublish = useCallback(() => {
    if (!props.publishToStore) return;
    setPublishErr(null);
    setPublishing(true);
    const fd = new FormData();
    fd.set("pieceId", pieceId);
    startLoad(async () => {
      const r = await props.publishToStore!(fd);
      setPublishing(false);
      if (!r.ok) setPublishErr(r.error ?? "Publish failed.");
      router.refresh();
    });
  }, [pieceId, props, router]);

  // Restore an earlier version: rollback() snapshots the chosen version's content
  // as a NEW latest version (non-destructive — every version is retained) and
  // reopens the piece for review. Serves GOAL #8's one-click rollback.
  const doRestore = useCallback(() => {
    const target = selected;
    const fd = new FormData();
    fd.set("pieceId", pieceId);
    fd.set("version", String(target));
    startLoad(async () => {
      await rollback(fd);
      setSelected(latestVersion + 1); // rollback writes v(latest+1) = a copy of v{target}
      router.refresh();
    });
  }, [pieceId, selected, latestVersion, router]);

  const frozen = poll === "rewriting";
  const approved = status === "APPROVED";
  const published = status === "PUBLISHED";

  return (
    <div className="space-y-4">
      {/* Top bar: version selector + state-dependent CTA */}
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-muted-foreground flex items-center gap-2 text-sm">
          Version
          <select
            className="border-input bg-background h-8 rounded-md border px-2 text-sm"
            value={selected}
            disabled={frozen}
            onChange={(e) => onSelectVersion(Number(e.target.value))}
          >
            {versions.map((v) => (
              <option key={v.version} value={v.version}>
                {v.version === latestVersion ? `v${v.version} · latest` : v.version === 1 ? `v1 · original` : `v${v.version}`}
                {v.note ? ` — ${v.note}` : ""}
              </option>
            ))}
          </select>
        </label>
        {loadingVersion && <span className="text-muted-foreground text-xs">loading…</span>}
        {!onLatest && (
          <>
            <Badge variant="warning">
              viewing v{selected} (read-only) ·{" "}
              <button type="button" className="underline" onClick={() => onSelectVersion(latestVersion)}>jump to latest</button>
            </Badge>
            <Button
              size="sm"
              variant="outline"
              onClick={doRestore}
              disabled={frozen || loadingVersion}
              title={`Restore v${selected} as a new version (the current draft is kept in history)`}
            >
              {loadingVersion ? "Restoring…" : `Restore v${selected}`}
            </Button>
          </>
        )}

        <span className="flex-1" />

        {/* Primary CTA depends on state */}
        {onLatest && !approved && !published && (
          openComments > 0 ? (
            <Button onClick={sendFeedback} disabled={frozen}>
              {frozen ? "Rewriting…" : `Send feedback (${openComments})`}
            </Button>
          ) : (
            <Button
              onClick={doApprove}
              disabled={frozen || loadingVersion}
              className="bg-emerald-600 text-primary-foreground hover:bg-emerald-600/90"
            >
              Approve to publish
            </Button>
          )
        )}

        {onLatest && approved && props.publishToStore && (
          <Button onClick={doPublish} disabled={publishing}>
            {publishing ? "Publishing…" : "Publish to store"}
          </Button>
        )}
        {approved && !published && <Badge variant="success">approved</Badge>}
        {published && <Badge variant="info">published</Badge>}
      </div>

      {/* Hint only on the latest editable version */}
      {onLatest && !approved && !published && (
        <p className="text-muted-foreground text-xs">
          {openComments > 0
            ? "Click Send feedback to apply your comments. The view freezes while the AI rewrites only the commented spans, then jumps to the new version."
            : "Highlight text to comment, or Approve to publish. Nothing publishes without your approval."}
        </p>
      )}

      {/* System message (feedback accepted / rewrite result) */}
      {systemMsg && (
        <div className={`rounded-lg border p-3 text-sm ${poll === "error" ? "border-amber-300 bg-amber-50 text-amber-900" : "border-emerald-300 bg-emerald-50 text-emerald-900"}`}>
          {systemMsg}
        </div>
      )}

      {/* Per-comment outcome: every comment's fate, so nothing silently no-ops. */}
      {outcomeEdits && outcomeEdits.length > 0 && (
        <div className="bg-card space-y-2 rounded-lg border p-3 text-sm">
          <div className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">
            Feedback results · {outcomeEdits.filter((e) => e.changed).length} of {outcomeEdits.length} changed
          </div>
          {outcomeEdits.map((e, i) => (
            <div key={i} className={`rounded border p-2 text-xs ${e.changed ? "border-emerald-200" : "border-amber-200 bg-amber-50/40"}`}>
              <div className="mb-1 flex items-center gap-2">
                <span className={`rounded px-1.5 py-0.5 font-semibold ${e.changed ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
                  {REASON_LABEL[e.reason] ?? e.reason}
                </span>
                {!e.changed && e.note && <span className="text-amber-800">{e.note}</span>}
              </div>
              {e.changed ? (
                <>
                  <div className="rounded bg-red-50 px-1.5 py-1 text-red-900 line-through decoration-red-400">{e.before || "(empty)"}</div>
                  <div className="mt-1 rounded bg-green-50 px-1.5 py-1 text-green-900">{e.after || "(removed)"}</div>
                </>
              ) : (
                <div className="text-muted-foreground">{`"${e.before.length > 90 ? e.before.slice(0, 89) + "…" : e.before}"`}</div>
              )}
            </div>
          ))}
        </div>
      )}
      {publishErr && <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">{publishErr}</div>}
      {published && publishedUrl && (
        <div className="rounded-lg border border-green-300 bg-green-50 p-3 text-sm text-green-900">
          <b>Published live.</b> <a href={publishedUrl} target="_blank" rel="noreferrer" className="underline">{publishedUrl}</a>
        </div>
      )}

      {/* Quality checks — collapsed by default (not reviewer's first concern). */}
      {(verdict || flags.length > 0) && (
        <div className="bg-muted/40 rounded-lg border text-sm">
          <button type="button" className="flex w-full items-center justify-between px-4 py-2 text-left" onClick={() => setShowChecks((s) => !s)}>
            <span className="font-medium">Quality checks{flags.some((f) => f.severity === "BAD") ? " · needs attention" : ""}</span>
            <span className="text-muted-foreground text-xs">{showChecks ? "hide" : "show"}</span>
          </button>
          {showChecks && (
            <div className="space-y-1 px-4 pb-3">
              {verdict && (
                <p className="text-muted-foreground text-xs">Grounding verifier: {verdict.verdict === "pass" ? "passed" : "failed"}{verdict.failures?.length ? ` — ${verdict.failures.join("; ")}` : ""}</p>
              )}
              {flags.map((f, i) => (
                <div key={i} className={`rounded border-l-4 px-3 py-1.5 ${f.severity === "BAD" ? "border-red-400 bg-red-50" : f.severity === "GOOD" ? "border-green-400 bg-green-50" : "border-amber-400 bg-amber-50"}`}>
                  <b className="text-xs uppercase">{f.type}</b>
                  <div className="text-foreground">{f.note}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Engine research story (read-only) above the draft. */}
      <BriefPanel brief={brief ?? null} />

      {/* The article + Google-Docs comment rail. Read-only off-latest or while frozen. */}
      <div className={frozen ? "pointer-events-none relative opacity-60" : "relative"}>
        {frozen && (
          <div className="absolute inset-0 z-10 flex items-center justify-center">
            <div className="bg-card/90 rounded-lg px-4 py-3 text-sm font-medium shadow">Rewriting the commented spans…</div>
          </div>
        )}
        <PiecePreview
          key={`${selected}-${view.html.length}`}
          pieceId={pieceId}
          version={selected}
          html={view.html}
          meta={meta}
          comments={onLatest ? comments : []}
          addComment={props.addComment}
          readOnly={!onLatest || approved || published || frozen}
        />
      </div>
    </div>
  );
}
