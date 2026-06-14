import { describe, it, expect } from "vitest";
import {
  parseCron,
  validateCron,
  nextRunAt,
  prevFireAt,
  isDue,
  presetToCron,
  cronToCadence,
} from "../cron";

const at = (iso: string) => new Date(iso);

describe("cron parsing + validation", () => {
  it("accepts standard 5-field expressions", () => {
    expect(validateCron("0 9 * * 1").ok).toBe(true);
    expect(validateCron("*/15 * * * *").ok).toBe(true);
    expect(validateCron("0 9,17 1-15 * *").ok).toBe(true);
  });
  it("rejects malformed / out-of-range", () => {
    expect(validateCron("0 9 * *").ok).toBe(false); // 4 fields
    expect(validateCron("99 * * * *").ok).toBe(false); // minute > 59
    expect(validateCron("0 9 * * 9").ok).toBe(false); // dow > 6
    expect(validateCron("a b c d e").ok).toBe(false);
  });
  it("parses a step field into the right set", () => {
    const p = parseCron("*/20 * * * *");
    expect(p.minute.test(0)).toBe(true);
    expect(p.minute.test(20)).toBe(true);
    expect(p.minute.test(40)).toBe(true);
    expect(p.minute.test(10)).toBe(false);
  });
});

describe("presets <-> cadence", () => {
  it("maps presets to cron and back", () => {
    expect(presetToCron("weekly")).toBe("0 9 * * 1");
    expect(presetToCron("off")).toBeNull();
    expect(cronToCadence("0 9 * * 1")).toBe("weekly");
    expect(cronToCadence("0 9 * * *")).toBe("daily");
    expect(cronToCadence("0 9 1 * *")).toBe("monthly");
    expect(cronToCadence(null)).toBe("off");
    expect(cronToCadence("*/5 * * * *")).toBe("custom");
  });
});

describe("nextRunAt / prevFireAt (UTC)", () => {
  it("daily 09:00 from mid-morning rolls to next day", () => {
    const n = nextRunAt("0 9 * * *", at("2026-06-13T10:00:00Z"))!;
    expect(n.toISOString()).toBe("2026-06-14T09:00:00.000Z");
  });
  it("daily 09:00 from before fires same day", () => {
    const n = nextRunAt("0 9 * * *", at("2026-06-13T08:00:00Z"))!;
    expect(n.toISOString()).toBe("2026-06-13T09:00:00.000Z");
  });
  it("weekly Monday 09:00 lands on the right weekday", () => {
    // 2026-06-13 is a Saturday; next Monday is 2026-06-15
    const n = nextRunAt("0 9 * * 1", at("2026-06-13T12:00:00Z"))!;
    expect(n.toISOString()).toBe("2026-06-15T09:00:00.000Z");
    expect(n.getUTCDay()).toBe(1);
  });
  it("prevFireAt returns the most recent past occurrence", () => {
    const p = prevFireAt("0 9 * * *", at("2026-06-13T10:00:00Z"))!;
    expect(p.toISOString()).toBe("2026-06-13T09:00:00.000Z");
  });
});

describe("isDue", () => {
  const now = at("2026-06-13T10:00:00Z"); // last daily fire was 09:00 today
  it("never-run project is due on the first tick", () => {
    expect(isDue("0 9 * * *", null, now)).toBe(true);
  });
  it("not due if it already ran after the last fire", () => {
    expect(isDue("0 9 * * *", at("2026-06-13T09:30:00Z"), now)).toBe(false);
  });
  it("due if the last run predates the last fire", () => {
    expect(isDue("0 9 * * *", at("2026-06-12T09:30:00Z"), now)).toBe(true);
  });
  it("invalid cron is never due (safe)", () => {
    expect(isDue("nonsense", null, now)).toBe(false);
  });
});
