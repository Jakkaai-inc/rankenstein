"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  type CronCadence,
  cronToCadence,
  presetToCron,
  nextRunAt,
  validateCron,
} from "@/lib/run/cron";

const selectCls =
  "border-input bg-background ring-offset-background focus-visible:ring-ring h-9 w-full rounded-md border px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1";

function fmt(d: Date | null): string {
  return d ? d.toUTCString() : "n/a";
}

export default function ScheduleForm({
  action,
  currentCron,
  lastRunAt,
}: {
  action: (formData: FormData) => void | Promise<void>;
  currentCron: string | null;
  lastRunAt: string | null;
}) {
  const [cadence, setCadence] = useState<CronCadence>(cronToCadence(currentCron));
  const [customCron, setCustomCron] = useState(cronToCadence(currentCron) === "custom" ? (currentCron ?? "") : "");

  const effectiveCron = cadence === "custom" ? customCron.trim() : presetToCron(cadence);
  const customError = cadence === "custom" && customCron.trim() ? validateCron(customCron.trim()).error : undefined;

  const next = useMemo(() => {
    if (!effectiveCron) return null;
    if (!validateCron(effectiveCron).ok) return null;
    try {
      return nextRunAt(effectiveCron);
    } catch {
      return null;
    }
  }, [effectiveCron]);

  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-1.5">
        <Label htmlFor="cadence">Cadence</Label>
        <select
          id="cadence"
          name="cadence"
          value={cadence}
          onChange={(e) => setCadence(e.target.value as CronCadence)}
          className={selectCls}
        >
          <option value="off">Off (on-demand only)</option>
          <option value="daily">Daily (09:00 UTC)</option>
          <option value="weekly">Weekly (Mondays, 09:00 UTC)</option>
          <option value="monthly">Monthly (1st, 09:00 UTC)</option>
          <option value="custom">Custom cron…</option>
        </select>
      </div>

      {cadence === "custom" && (
        <div className="grid gap-1.5">
          <Label htmlFor="customCron">Cron expression (5-field, UTC)</Label>
          <Input
            id="customCron"
            name="customCron"
            placeholder="0 9 * * 1"
            value={customCron}
            onChange={(e) => setCustomCron(e.target.value)}
            aria-invalid={customError ? true : undefined}
          />
          {customError ? (
            <p className="text-destructive text-xs">{customError}</p>
          ) : (
            <p className="text-muted-foreground text-xs">minute hour day-of-month month day-of-week</p>
          )}
        </div>
      )}
      {/* keep a customCron field in the form even for presets, so the action reads a stable shape */}
      {cadence !== "custom" && <input type="hidden" name="customCron" value="" />}

      <div className="text-muted-foreground space-y-1 text-sm">
        <p>
          Next run:{" "}
          <span className="text-foreground font-medium">
            {cadence === "off" ? "not scheduled" : next ? fmt(next) : customError ? "fix the cron above" : "n/a"}
          </span>
        </p>
        <p>
          Last run: <span className="text-foreground font-medium">{lastRunAt ? fmt(new Date(lastRunAt)) : "never"}</span>
        </p>
      </div>

      <Button type="submit" disabled={!!customError}>
        Save schedule
      </Button>
    </form>
  );
}
