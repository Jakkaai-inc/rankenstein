// Scheduled-run engine. A coarse external tick (EventBridge -> /api/cron/tick, or
// a worker) calls tickScheduledRuns(); it scans RunConfigs that carry a cron,
// fires the ones that are due (detached, via the existing orchestrator), and
// dedups so a project is never double-fired. No schema change: "last run" and
// "in progress" are derived from the Run table.

import { prisma } from "@/lib/db";
import { runCatalogRewrite, runArticleBatch } from "./orchestrator";
import { isDue, validateCron } from "./cron";

/** Pieces per scheduled run (kept small; repeat ticks advance the catalog). */
export const SCHEDULED_RUN_LIMIT = 3;

export type DueRow = {
  projectId: string;
  contentType: "product" | "article";
  scheduleCron: string | null;
  lastRunAt: Date | null;
  inProgress: boolean;
};

export type DueRun = { projectId: string; contentType: "product" | "article" };

/**
 * PURE: which scheduled configs should fire at `now`. Skips off/invalid crons,
 * in-progress projects, and those already run since the last fire. Dedups to at
 * most one run per project per tick.
 */
export function selectDueRuns(rows: DueRow[], now: Date = new Date()): DueRun[] {
  const out: DueRun[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    if (seen.has(r.projectId)) continue;
    if (!r.scheduleCron || !validateCron(r.scheduleCron).ok) continue;
    if (r.inProgress) continue;
    if (!isDue(r.scheduleCron, r.lastRunAt, now)) continue;
    seen.add(r.projectId);
    out.push({ projectId: r.projectId, contentType: r.contentType });
  }
  return out;
}

export type TickResult = {
  checked: number;
  fired: { projectId: string; runId: string; contentType: string }[];
};

function fireDetached(projectId: string, runId: string, contentType: "product" | "article") {
  const fail = async () => {
    await prisma.run.update({ where: { id: runId }, data: { status: "FAILED", finishedAt: new Date() } }).catch(() => {});
  };
  if (contentType === "article") {
    void runArticleBatch({ projectId, runId, limit: SCHEDULED_RUN_LIMIT }).catch(fail);
  } else {
    void runCatalogRewrite({ projectId, runId, limit: SCHEDULED_RUN_LIMIT }).catch(fail);
  }
}

/** DB-backed tick: load scheduled configs, derive last-run/in-progress from the
 *  Run table, fire the due ones detached. Single external scheduler assumed
 *  (EventBridge fires once); residual concurrent-tick races are acceptable for
 *  the coarse cadences this serves. */
export async function tickScheduledRuns(now: Date = new Date()): Promise<TickResult> {
  const configs = await prisma.runConfig.findMany({
    where: { scheduleCron: { not: null } },
    select: { projectId: true, contentType: true, scheduleCron: true },
  });

  const rows: DueRow[] = [];
  for (const c of configs) {
    const [latest, inProgress] = await Promise.all([
      prisma.run.findFirst({
        where: { projectId: c.projectId },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      }),
      prisma.run.count({ where: { projectId: c.projectId, status: { in: ["QUEUED", "RUNNING"] } } }),
    ]);
    rows.push({
      projectId: c.projectId,
      contentType: c.contentType === "article" ? "article" : "product",
      scheduleCron: c.scheduleCron,
      lastRunAt: latest?.createdAt ?? null,
      inProgress: inProgress > 0,
    });
  }

  const due = selectDueRuns(rows, now);
  const fired: TickResult["fired"] = [];
  for (const d of due) {
    const run = await prisma.run.create({ data: { projectId: d.projectId, status: "QUEUED" } });
    fireDetached(d.projectId, run.id, d.contentType);
    fired.push({ projectId: d.projectId, runId: run.id, contentType: d.contentType });
  }
  return { checked: rows.length, fired };
}
