import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { addDays, daysLeft } from "./cycle";
import { runOutForecast } from "./warnings";

// "At this pace you'll run out on Oct 23, 8 days early.
//  Spending 7.500 DT less per day fixes it."
//
// The pace is the average daily spending of the last finished days (up to 7).
// Days are calendar days in Tunisia; amounts are integer millimes.

const base = { today: "2026-10-15", nextTransferOn: "2026-10-31" } as const; // 16 days left

const week = (perDay: number) => Array.from({ length: 7 }, () => perDay);

describe("runOutForecast", () => {
  it("warns when the money will run out before the next transfer", () => {
    // 120 DT left, spending 15 DT a day: lasts 8 days (Oct 15 → 22), out on Oct 23.
    // To last 16 days she can spend 7.5 DT a day, so 7.5 DT less than now.
    expect(
      runOutForecast({ ...base, poolNow: 120_000, recentDailySpending: week(15_000) }),
    ).toEqual({
      status: "warning",
      runsOutOn: "2026-10-23",
      daysShort: 8,
      cutPerDay: 7_500,
    });
  });

  it("is safe when the money lasts until the transfer", () => {
    expect(
      runOutForecast({ ...base, poolNow: 200_000, recentDailySpending: week(10_000) }),
    ).toEqual({
      status: "safe",
    });
  });

  it("is safe when the money lasts exactly until the transfer", () => {
    // 160 DT at 10 DT a day = 16 days.
    expect(
      runOutForecast({ ...base, poolNow: 160_000, recentDailySpending: week(10_000) }),
    ).toEqual({
      status: "safe",
    });
  });

  it("is safe when she spent nothing recently", () => {
    expect(runOutForecast({ ...base, poolNow: 50_000, recentDailySpending: week(0) })).toEqual({
      status: "safe",
    });
  });

  it("needs at least 3 finished days to judge the pace", () => {
    expect(
      runOutForecast({ ...base, poolNow: 1_000, recentDailySpending: [50_000, 50_000] }),
    ).toEqual({
      status: "not_enough_data",
    });
  });

  it("uses only the last 7 days", () => {
    // Ten days of data: three old expensive days, then seven days at 10 DT.
    const spending = [90_000, 90_000, 90_000, ...week(10_000)];
    expect(runOutForecast({ ...base, poolNow: 200_000, recentDailySpending: spending })).toEqual({
      status: "safe",
    });
  });

  it("is out today when the daily money is already used up", () => {
    expect(runOutForecast({ ...base, poolNow: 0, recentDailySpending: week(10_000) })).toEqual({
      status: "out",
      runsOutOn: "2026-10-15",
    });
    expect(runOutForecast({ ...base, poolNow: -5_000, recentDailySpending: week(10_000) })).toEqual(
      {
        status: "out",
        runsOutOn: "2026-10-15",
      },
    );
  });

  it("rounds the pace up so the suggested cut is never too small", () => {
    // Oct 21 → Oct 30 is 10 days. Pace 30.001 DT / 3 days = 10.0003 DT, rounded up to 10.001.
    // 100 DT lasts 9 days at that pace. To last 10 days: 10 DT a day, so cut 0.001 DT.
    expect(
      runOutForecast({
        today: "2026-10-21",
        nextTransferOn: "2026-10-31",
        poolNow: 100_000,
        recentDailySpending: [10_000, 10_000, 10_001],
      }),
    ).toEqual({ status: "warning", runsOutOn: "2026-10-30", daysShort: 1, cutPerDay: 1 });
  });

  it("is out when the money is used up, even with too little data", () => {
    // No money left is a fact; it doesn't need a pace.
    expect(runOutForecast({ ...base, poolNow: 0, recentDailySpending: [10_000] })).toEqual({
      status: "out",
      runsOutOn: "2026-10-15",
    });
  });

  it("warns that it runs out today when there's less than one day's pace left", () => {
    // 5 DT left at 10 DT a day: not even today is covered, but money is left, so not "out".
    // To last 16 days: 5 DT / 16 = 0.312 DT a day, so cut 10 − 0.312 = 9.688 DT.
    expect(runOutForecast({ ...base, poolNow: 5_000, recentDailySpending: week(10_000) })).toEqual({
      status: "warning",
      runsOutOn: "2026-10-15",
      daysShort: 16,
      cutPerDay: 9_688,
    });
  });

  it("rejects invalid input", () => {
    const ok = { ...base, poolNow: 100_000, recentDailySpending: week(10_000) };
    expect(() => runOutForecast({ ...ok, poolNow: 1.5 })).toThrow();
    expect(() => runOutForecast({ ...ok, recentDailySpending: [10_000, -1, 10_000] })).toThrow();
    expect(() => runOutForecast({ ...ok, recentDailySpending: [10_000, 2.5, 10_000] })).toThrow();
  });

  // Property-based tests.
  const today = fc.integer({ min: 0, max: 29 }).map((n) => addDays("2026-10-01", n));
  const pool = fc.integer({ min: 1, max: 5_000_000 });
  const spending = fc.array(fc.integer({ min: 0, max: 200_000 }), { minLength: 3, maxLength: 10 });

  it("a warning always means running out before the transfer", () => {
    fc.assert(
      fc.property(today, pool, spending, (t, p, s) => {
        const result = runOutForecast({
          today: t,
          nextTransferOn: "2026-10-31",
          poolNow: p,
          recentDailySpending: s,
        });
        if (result.status === "warning") {
          expect(result.runsOutOn < "2026-10-31").toBe(true);
          expect(result.runsOutOn >= t).toBe(true);
          expect(result.daysShort).toBeGreaterThan(0);
          expect(result.cutPerDay).toBeGreaterThan(0);
        }
      }),
    );
  });

  it("following the suggested cut makes the money last until the transfer", () => {
    fc.assert(
      fc.property(today, pool, spending, (t, p, s) => {
        const result = runOutForecast({
          today: t,
          nextTransferOn: "2026-10-31",
          poolNow: p,
          recentDailySpending: s,
        });
        if (result.status === "warning") {
          const last7 = s.slice(-7);
          const paceRoundedUp = Math.ceil(last7.reduce((a, b) => a + b, 0) / last7.length);
          const newPace = paceRoundedUp - result.cutPerDay;
          expect(newPace * daysLeft(t, "2026-10-31")).toBeLessThanOrEqual(p);
        }
      }),
    );
  });
});
