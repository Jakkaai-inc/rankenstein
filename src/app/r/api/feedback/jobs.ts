// In-memory rewrite-job registry for the review long-poll.
//
// "Send feedback" starts a rewrite job and returns immediately; the client polls
// the status route until the job finishes and a new version lands. We track the
// job here rather than in the DB: a rewrite is short-lived and tied to one live
// review session, and App Runner serves the web from a single instance today.
// If/when the web scales horizontally, promote this to a ContentItem column
// (Lane A owns schema) — the route contract below stays the same.

import type { ApplyReviewOutcome } from "@/app/review/actions";

export type JobState = "rewriting" | "done" | "error";

export interface RewriteJob {
  pieceId: string;
  state: JobState;
  fromVersion: number; // the version the reviewer submitted feedback against
  newVersion?: number; // set when done
  message?: string; // reviewer-facing system message
  outcome?: ApplyReviewOutcome; // before/after detail for the system message
  startedAt: number;
}

// Keyed by pieceId — one active rewrite per piece at a time.
const jobs = new Map<string, RewriteJob>();

const TTL_MS = 5 * 60 * 1000; // forget finished jobs after 5 minutes

export function getJob(pieceId: string): RewriteJob | null {
  const j = jobs.get(pieceId);
  if (!j) return null;
  // Expire stale finished jobs so a later submit starts clean.
  if (j.state !== "rewriting" && Date.now() - j.startedAt > TTL_MS) {
    jobs.delete(pieceId);
    return null;
  }
  return j;
}

export function startJob(pieceId: string, fromVersion: number): RewriteJob {
  const job: RewriteJob = { pieceId, state: "rewriting", fromVersion, startedAt: nowSafe() };
  jobs.set(pieceId, job);
  return job;
}

export function finishJob(pieceId: string, patch: Partial<RewriteJob>): void {
  const j = jobs.get(pieceId);
  if (!j) return;
  jobs.set(pieceId, { ...j, ...patch });
}

// Date.now() is fine in app code (only workflow SCRIPTS forbid it).
function nowSafe(): number {
  return Date.now();
}
