import { describe, expect, it } from "vitest";
import { ScheduleError, computeUnlockAt } from "@/lib/time/release";

const iso = (d: Date) => d.toISOString();

describe("release time calculation", () => {
  it("keeps the wall-clock time across a DST change", () => {
    // 10 March 2030 09:30 in New York (EST, UTC-5). Thirty days later is EDT (UTC-4).
    const now = new Date("2030-03-01T14:30:00Z");
    const at = computeUnlockAt({ kind: "preset", preset: "30d", timezone: "America/New_York" }, now);
    expect(iso(at)).toBe("2030-03-31T13:30:00.000Z"); // still 09:30 local, one UTC hour earlier
  });

  it("converts a custom local time using the zone's offset on that date", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    expect(iso(computeUnlockAt({ kind: "custom", local: "2031-07-01T09:00", timezone: "Europe/London" }, now))).toBe("2031-07-01T08:00:00.000Z");
    expect(iso(computeUnlockAt({ kind: "custom", local: "2031-12-01T09:00", timezone: "Europe/London" }, now))).toBe("2031-12-01T09:00:00.000Z");
    expect(iso(computeUnlockAt({ kind: "custom", local: "2031-07-01T09:00", timezone: "Asia/Tokyo" }, now))).toBe("2031-07-01T00:00:00.000Z");
  });

  it("moves a time skipped by spring-forward to the next valid instant", () => {
    // 02:30 on 9 March 2031 doesn't exist in New York.
    const at = computeUnlockAt({ kind: "custom", local: "2031-03-09T02:30", timezone: "America/New_York" }, new Date("2026-01-01T00:00:00Z"));
    expect(iso(at)).toBe("2031-03-09T07:30:00.000Z"); // 03:30 EDT
  });

  it("resolves a time repeated by fall-back to its first occurrence", () => {
    // 01:30 on 2 November 2031 happens twice in New York; take the EDT one.
    const at = computeUnlockAt({ kind: "custom", local: "2031-11-02T01:30", timezone: "America/New_York" }, new Date("2026-01-01T00:00:00Z"));
    expect(iso(at)).toBe("2031-11-02T05:30:00.000Z");
  });

  it("computes milestone birthdays, including 29 February", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    const eighteenth = computeUnlockAt({ kind: "milestone", milestone: "birthday", baseDate: "2020-05-17", years: 18, time: "08:00", timezone: "Africa/Nairobi" }, now);
    expect(iso(eighteenth)).toBe("2038-05-17T05:00:00.000Z");
    const leap = computeUnlockAt({ kind: "milestone", milestone: "birthday", baseDate: "2000-02-29", years: 30, timezone: "UTC" }, now);
    expect(iso(leap)).toBe("2030-02-28T09:00:00.000Z");
  });

  it("rejects the past, the far future, bad zones and timestamps with offsets", () => {
    const now = new Date("2026-06-01T12:00:00Z");
    expect(() => computeUnlockAt({ kind: "custom", local: "2026-06-01T11:00", timezone: "UTC" }, now)).toThrow(ScheduleError);
    expect(() => computeUnlockAt({ kind: "custom", local: "2200-01-01T00:00", timezone: "UTC" }, now)).toThrow(ScheduleError);
    expect(() => computeUnlockAt({ kind: "custom", local: "2030-01-01T00:00", timezone: "Mars/Olympus" }, now)).toThrow(ScheduleError);
    expect(() => computeUnlockAt({ kind: "custom", local: "2030-01-01T00:00Z", timezone: "UTC" }, now)).toThrow(ScheduleError);
    expect(() => computeUnlockAt({ kind: "milestone", milestone: "birthday", baseDate: "1990-01-01", years: 30, timezone: "UTC" }, now)).toThrow(ScheduleError);
  });

  it("a one-year preset lands on the same calendar day next year", () => {
    const at = computeUnlockAt({ kind: "preset", preset: "1y", timezone: "Australia/Sydney" }, new Date("2027-02-10T01:15:30Z"));
    expect(iso(at)).toBe("2028-02-10T01:15:00.000Z");
  });
});
