import { describe, it, expect } from "vitest";
import { selectDueRuns, type DueRow } from "../scheduler";

const now = new Date("2026-06-13T10:00:00Z"); // last daily fire: 09:00 today
const base: DueRow = {
  projectId: "p1",
  contentType: "product",
  scheduleCron: "0 9 * * *",
  lastRunAt: null,
  inProgress: false,
};

describe("selectDueRuns", () => {
  it("fires a due, never-run schedule", () => {
    expect(selectDueRuns([base], now)).toEqual([{ projectId: "p1", contentType: "product" }]);
  });

  it("skips off (null cron) and invalid crons", () => {
    expect(selectDueRuns([{ ...base, scheduleCron: null }], now)).toEqual([]);
    expect(selectDueRuns([{ ...base, scheduleCron: "nope" }], now)).toEqual([]);
  });

  it("skips a project with an in-progress run", () => {
    expect(selectDueRuns([{ ...base, inProgress: true }], now)).toEqual([]);
  });

  it("skips a schedule that already ran since the last fire", () => {
    expect(selectDueRuns([{ ...base, lastRunAt: new Date("2026-06-13T09:30:00Z") }], now)).toEqual([]);
  });

  it("fires when the last run predates the last fire", () => {
    expect(selectDueRuns([{ ...base, lastRunAt: new Date("2026-06-12T12:00:00Z") }], now)).toEqual([
      { projectId: "p1", contentType: "product" },
    ]);
  });

  it("preserves contentType (article)", () => {
    expect(selectDueRuns([{ ...base, contentType: "article" }], now)).toEqual([
      { projectId: "p1", contentType: "article" },
    ]);
  });

  it("dedups to one run per project per tick", () => {
    const two: DueRow[] = [base, { ...base, contentType: "article" }];
    expect(selectDueRuns(two, now)).toEqual([{ projectId: "p1", contentType: "product" }]);
  });
});
