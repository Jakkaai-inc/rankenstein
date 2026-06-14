"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Rocket, Loader2, CheckCircle2, AlertTriangle, ClipboardCheck, Sparkles } from "lucide-react";

import { startBatch, getRunProgress, getActiveRun, type RunProgress } from "@/app/actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";

const TERMINAL = new Set(["SUCCEEDED", "PAUSED", "FAILED"]);

export default function OverviewActions({ projectId, slug, pending }: { projectId: string; slug: string; pending: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [runId, setRunId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [progress, setProgress] = useState<RunProgress | null>(null);
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);
  const refreshed = useRef(false);

  const running = starting || (!!progress && !TERMINAL.has(progress.status)) || (!!runId && !progress);

  const stopPolling = useCallback(() => {
    if (poll.current) { clearInterval(poll.current); poll.current = null; }
  }, []);

  // Poll the active run's progress while it runs; refresh the dashboard once when done.
  useEffect(() => {
    if (!runId) return;
    let alive = true;
    const tick = async () => {
      const p = await getRunProgress(projectId, runId).catch(() => null);
      if (!alive || !p) return;
      setProgress(p);
      if (TERMINAL.has(p.status)) {
        stopPolling();
        if (!refreshed.current) { refreshed.current = true; router.refresh(); }
      }
    };
    tick();
    poll.current = setInterval(tick, 2500);
    return () => { alive = false; stopPolling(); };
  }, [runId, projectId, router, stopPolling]);

  // Re-attach to an in-progress run after a refresh / reopen.
  useEffect(() => {
    getActiveRun(projectId).then((r) => { if (r) setRunId(r.runId); }).catch(() => {});
  }, [projectId]);

  async function onGenerate() {
    if (running) { setOpen(true); return; } // already running -> just reopen the panel
    setStarting(true);
    setOpen(true);
    setProgress(null);
    refreshed.current = false;
    try {
      const { runId: id } = await startBatch(projectId, 2);
      setRunId(id);
    } finally {
      setStarting(false);
    }
  }

  const log = progress?.log ?? [];
  const title = running ? "Generating content" : progress?.status === "PAUSED" ? "Batch paused" : "Batch complete";

  return (
    <div className="flex items-center gap-2">
      <Button onClick={onGenerate}>
        {running ? <><Loader2 className="size-4 animate-spin" /> Generating…{progress?.total ? ` ${progress.done + progress.flagged}/${progress.total}` : ""}</> : <><Rocket className="size-4" /> Generate a batch</>}
      </Button>

      <Link href={`/p/${slug}/review`} className={buttonVariants({ variant: "outline" })}>
        Review queue ({pending})
      </Link>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="flex flex-col sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{title}</SheetTitle>
            <SheetDescription>
              The full engine runs per product: research → SERP ownership → ground → rewrite → AEO → guardrails → independent verifier.
            </SheetDescription>
          </SheetHeader>

          <div className="flex min-h-0 flex-1 flex-col gap-4 p-4">
            {/* counts */}
            {progress && (progress.total > 0 || TERMINAL.has(progress.status)) && (
              <div className="flex flex-wrap gap-2 text-sm">
                <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-2.5 py-1"><CheckCircle2 className="size-4 text-emerald-600" /> {progress.done} ready</span>
                {progress.flagged > 0 && <span className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/5 px-2.5 py-1"><AlertTriangle className="size-4 text-amber-600" /> {progress.flagged} flagged</span>}
                {progress.total > 0 && <span className="text-muted-foreground inline-flex items-center px-1 py-1">of {progress.total}</span>}
              </div>
            )}

            {/* live chain-of-thought */}
            <div className="bg-muted/30 min-h-0 flex-1 space-y-2 overflow-y-auto rounded-lg border p-3 text-sm">
              {log.length === 0 && (
                <div className="text-muted-foreground flex items-center gap-2"><Loader2 className="size-4 animate-spin" /> Starting the engine…</div>
              )}
              {log.map((e, i) => {
                const last = i === log.length - 1;
                const isStage = e.phase === "stage";
                return (
                  <div key={i} className={`flex items-start gap-2 ${isStage ? "pl-5" : ""}`}>
                    {running && last
                      ? <Loader2 className="text-primary mt-0.5 size-4 shrink-0 animate-spin" />
                      : <span className={`shrink-0 rounded-full ${isStage ? "bg-muted-foreground/30 mt-1.5 size-1" : "bg-muted-foreground/50 mt-1.5 size-1.5"}`} />}
                    <span className={(last && running ? "text-foreground" : "text-muted-foreground") + (isStage ? " text-xs" : "")}>{e.message}</span>
                  </div>
                );
              })}
            </div>

            {running ? (
              <p className="text-muted-foreground text-xs">You can close this and keep using the dashboard — the run continues. Reopen it anytime from “Generate”.</p>
            ) : (
              <div className="flex gap-2">
                <Link href={`/p/${slug}/review`} className={buttonVariants({})} onClick={() => setOpen(false)}>
                  <ClipboardCheck className="size-4" /> Open review queue
                </Link>
                <Button variant="outline" onClick={() => setOpen(false)}>Close</Button>
              </div>
            )}

            {!running && progress && progress.flagged > 0 && (
              <p className="text-muted-foreground flex items-start gap-1.5 text-xs"><Sparkles className="mt-0.5 size-3.5" /> Flagged pieces were held out of review — the independent verifier caught ungrounded claims.</p>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
