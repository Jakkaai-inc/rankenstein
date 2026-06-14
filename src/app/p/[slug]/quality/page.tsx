import { notFound, redirect } from "next/navigation";

import { prisma } from "@/lib/db";
import { getAccount } from "@/lib/session";
import { findProjectBySlug } from "@/lib/slug";
import { deriveChecklist } from "@/lib/run/checklist";
import { toChecklistConfig } from "@/lib/run/config";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import QualificationChecklist from "@/components/quality/QualificationChecklist";
import RunConfigForm from "@/components/quality/RunConfigForm";
import ScheduleForm from "@/components/quality/ScheduleForm";
import { saveRunConfig, saveSchedule } from "./actions";

export const dynamic = "force-dynamic";

export default async function QualityPage({ params }: { params: Promise<{ slug: string }> }) {
  const account = await getAccount();
  if (!account) redirect("/login");
  const { slug } = await params;

  const resolved = await findProjectBySlug(account.id, slug);
  if (!resolved) notFound();

  const [runConfig, brandProfile, lastRun] = await Promise.all([
    prisma.runConfig.findFirst({ where: { projectId: resolved.id, name: "Default" } }),
    prisma.brandProfile.findUnique({ where: { projectId: resolved.id } }),
    prisma.run.findFirst({ where: { projectId: resolved.id }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
  ]);

  const config = toChecklistConfig(runConfig);

  // bannedWords + trademarks live inside the voiceHardRules JSON blob.
  const hardRules = (brandProfile?.voiceHardRules ?? {}) as Record<string, unknown>;
  const countArray = (v: unknown): number => (Array.isArray(v) ? v.length : 0);

  const checklist = deriveChecklist(config, {
    bannedWordCount: countArray(hardRules.bannedWords),
    trademarkCount: countArray(hardRules.trademarks),
  });

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-xl font-bold">Quality goal</h1>
        <p className="text-muted-foreground text-sm">
          Configure the run and see the qualification checklist it derives. The checklist is the rubric every piece must
          clear before it becomes a publish candidate — it is not baked in, it is computed from these settings and this
          project&apos;s brand profile.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Run configuration</CardTitle>
          <CardDescription>Layer toggles and knobs. Saving updates the derived checklist below.</CardDescription>
        </CardHeader>
        <CardContent>
          <RunConfigForm config={config} action={saveRunConfig.bind(null, resolved.id)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Schedule</CardTitle>
          <CardDescription>
            Run this configuration on a recurring cadence. Each firing enqueues a batch just like an on-demand run; an
            already-running or already-fired period is skipped (no double runs).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ScheduleForm
            action={saveSchedule.bind(null, resolved.id)}
            currentCron={runConfig?.scheduleCron ?? null}
            lastRunAt={lastRun?.createdAt.toISOString() ?? null}
          />
        </CardContent>
      </Card>

      <div>
        <h2 className="mb-3 text-base font-semibold">Qualification checklist</h2>
        <QualificationChecklist checklist={checklist} />
      </div>
    </div>
  );
}
