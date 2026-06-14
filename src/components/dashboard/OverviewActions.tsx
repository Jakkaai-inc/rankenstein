"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Rocket, Loader2, CheckCircle2, AlertTriangle, ClipboardCheck } from "lucide-react";

import { runBatch, type RunBatchResult } from "@/app/actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";

export default function OverviewActions({ projectId, slug, pending }: { projectId: string; slug: string; pending: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const [result, dispatch, isRunning] = useActionState<RunBatchResult | null, FormData>(
    async (_prev, fd) => {
      const r = await runBatch(fd);
      router.refresh(); // update the dashboard counts behind the drawer
      return r;
    },
    null,
  );

  // open the drawer as soon as a run starts; keep the dashboard mounted behind it
  useEffect(() => {
    if (isRunning) setOpen(true);
  }, [isRunning]);

  return (
    <div className="flex items-center gap-2">
      <form action={dispatch}>
        <input type="hidden" name="projectId" value={projectId} />
        <input type="hidden" name="limit" value="2" />
        <Button type="submit" disabled={isRunning}>
          {isRunning ? <><Loader2 className="size-4 animate-spin" /> Generating… ~1 min</> : <><Rocket className="size-4" /> Generate a batch</>}
        </Button>
      </form>

      <Link href={`/p/${slug}/review`} className={buttonVariants({ variant: "outline" })}>
        Review queue ({pending})
      </Link>

      <Sheet open={open} onOpenChange={(o) => { if (!isRunning) setOpen(o); }}>
        <SheetContent className="sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{isRunning ? "Generating content" : "Batch complete"}</SheetTitle>
            <SheetDescription>
              The full engine runs per product: research → ground → rewrite → AEO → guardrails → verify.
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-4 p-4">
            {isRunning && (
              <div className="bg-muted/40 flex items-start gap-3 rounded-lg border p-4">
                <Loader2 className="text-primary mt-0.5 size-5 shrink-0 animate-spin" />
                <div>
                  <div className="text-sm font-medium">Working… this takes about a minute.</div>
                  <div className="text-muted-foreground text-xs">Grounding against your catalog and grading each piece with an independent verifier. You can keep using the dashboard.</div>
                </div>
              </div>
            )}

            {!isRunning && result && (
              <>
                <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm">
                  <CheckCircle2 className="size-5 shrink-0 text-emerald-600" />
                  <span><b>{result.done}</b> piece(s) added to the review queue.</span>
                </div>
                {result.flagged > 0 && (
                  <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
                    <AlertTriangle className="size-5 shrink-0 text-amber-600" />
                    <span><b>{result.flagged}</b> flagged by the verifier and held out of review (ungrounded claims caught).</span>
                  </div>
                )}
                <div className="flex gap-2">
                  <Link href={`/p/${slug}/review`} className={buttonVariants({})} onClick={() => setOpen(false)}>
                    <ClipboardCheck className="size-4" /> Open review queue
                  </Link>
                  <Button variant="outline" onClick={() => setOpen(false)}>Close</Button>
                </div>
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
