// Minimal, dependency-free 5-field cron utility (UTC).
//
//   ┌ minute (0-59)   ┌ hour (0-23)   ┌ day-of-month (1-31)
//   │   ┌ month (1-12)   ┌ day-of-week (0-6, 0=Sun)
//   *   *   *   *   *
//
// Supports *, n, a-b, a,b lists, and */step or a-b/step. Standard cron quirk:
// when BOTH day-of-month and day-of-week are restricted, a tick matches if
// EITHER matches. All times are UTC (DST is intentionally out of scope here).

export type CronCadence = "off" | "daily" | "weekly" | "monthly" | "custom";

const PRESETS: Record<Exclude<CronCadence, "off" | "custom">, string> = {
  daily: "0 9 * * *", // 09:00 UTC every day
  weekly: "0 9 * * 1", // 09:00 UTC every Monday
  monthly: "0 9 1 * *", // 09:00 UTC on the 1st
};

export function presetToCron(c: CronCadence): string | null {
  if (c === "off") return null;
  if (c === "custom") return null; // caller supplies the raw expression
  return PRESETS[c];
}

/** Map a stored cron back to a known preset for the UI (else "custom"). */
export function cronToCadence(cron: string | null | undefined): CronCadence {
  if (!cron) return "off";
  const norm = cron.trim().replace(/\s+/g, " ");
  for (const [k, v] of Object.entries(PRESETS)) if (v === norm) return k as CronCadence;
  return "custom";
}

type FieldMatcher = { test: (n: number) => boolean; restricted: boolean };

function parseField(field: string, min: number, max: number): FieldMatcher {
  if (field === "*") return { test: () => true, restricted: false };
  const allowed = new Set<number>();
  for (const part of field.split(",")) {
    const [rangePart, stepPart] = part.split("/");
    const step = stepPart ? Number(stepPart) : 1;
    if (!Number.isInteger(step) || step < 1) throw new Error(`bad step in "${field}"`);
    let lo = min;
    let hi = max;
    if (rangePart !== "*") {
      const m = rangePart.match(/^(\d+)(?:-(\d+))?$/);
      if (!m) throw new Error(`bad field "${field}"`);
      lo = Number(m[1]);
      hi = m[2] !== undefined ? Number(m[2]) : lo;
    }
    if (lo < min || hi > max || lo > hi) throw new Error(`out-of-range field "${field}"`);
    for (let v = lo; v <= hi; v += step) allowed.add(v);
  }
  return { test: (n) => allowed.has(n), restricted: true };
}

export interface ParsedCron {
  minute: FieldMatcher;
  hour: FieldMatcher;
  dom: FieldMatcher;
  month: FieldMatcher;
  dow: FieldMatcher;
}

export function parseCron(cron: string): ParsedCron {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) throw new Error(`cron must have 5 fields, got ${parts.length}`);
  return {
    minute: parseField(parts[0], 0, 59),
    hour: parseField(parts[1], 0, 23),
    dom: parseField(parts[2], 1, 31),
    month: parseField(parts[3], 1, 12),
    dow: parseField(parts[4], 0, 6),
  };
}

export function validateCron(cron: string): { ok: boolean; error?: string } {
  try {
    parseCron(cron);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "invalid cron" };
  }
}

function matches(p: ParsedCron, d: Date): boolean {
  const minOk = p.minute.test(d.getUTCMinutes());
  const hourOk = p.hour.test(d.getUTCHours());
  const monthOk = p.month.test(d.getUTCMonth() + 1);
  const domOk = p.dom.test(d.getUTCDate());
  const dowOk = p.dow.test(d.getUTCDay());
  // cron quirk: both DOM and DOW restricted => OR; otherwise AND.
  const dayOk = p.dom.restricted && p.dow.restricted ? domOk || dowOk : domOk && dowOk;
  return minOk && hourOk && monthOk && dayOk;
}

const MINUTE = 60_000;
const SEARCH_CAP_MIN = 366 * 24 * 60; // up to ~1 year of minutes

function floorToMinute(d: Date): Date {
  return new Date(Math.floor(d.getTime() / MINUTE) * MINUTE);
}

/** The next fire time strictly after `after`, or null if none within ~1 year. */
export function nextRunAt(cron: string, after: Date = new Date()): Date | null {
  const p = parseCron(cron);
  let t = floorToMinute(new Date(after.getTime() + MINUTE));
  for (let i = 0; i < SEARCH_CAP_MIN; i++) {
    if (matches(p, t)) return t;
    t = new Date(t.getTime() + MINUTE);
  }
  return null;
}

/** The most recent fire time at or before `before`, or null within ~1 year back. */
export function prevFireAt(cron: string, before: Date = new Date()): Date | null {
  const p = parseCron(cron);
  let t = floorToMinute(before);
  for (let i = 0; i < SEARCH_CAP_MIN; i++) {
    if (matches(p, t)) return t;
    t = new Date(t.getTime() - MINUTE);
  }
  return null;
}

/**
 * Is a scheduled run due now? Due iff there is a scheduled fire at-or-before now
 * that the project has not yet run for. A never-run project (lastRunAt null) is
 * due on the first tick. Invalid cron => never due (safe).
 */
export function isDue(cron: string, lastRunAt: Date | null, now: Date = new Date()): boolean {
  let pf: Date | null;
  try {
    pf = prevFireAt(cron, now);
  } catch {
    return false;
  }
  if (!pf) return false;
  return lastRunAt == null ? true : lastRunAt.getTime() < pf.getTime();
}
