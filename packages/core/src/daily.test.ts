import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { addDays } from "./cycle";
import { dailyPool, todayBudget, weekStartAllowance } from "./daily";

// Option B: today's amount is set once from what the student had at the
// START of the day. Spending today subtracts from it. Overspending or
// underspending changes tomorrow's amount (rollover).
//
// All amounts are integer millimes. "Daily money" = money for coffee, snacks,
// going out, small transport. Rent, bills and envelopes are NOT part of it.

describe("dailyPool", () => {
  it("is what's available minus what's reserved", () => {
    expect(dailyPool(400_000, 310_000)).toBe(90_000);
  });

  it("can be negative when reserved money is more than what's available", () => {
    expect(dailyPool(100_000, 150_000)).toBe(-50_000);
  });

  it("rejects non-integer amounts", () => {
    expect(() => dailyPool(1.5, 0)).toThrow();
    expect(() => dailyPool(0, 1.5)).toThrow();
  });
});

// Cycle used in most tests: money arrived Oct 1, next transfer Oct 31.
// That's 30 days, cut into weeks of 7, 7, 7, 7 and 2 days.
const cycle = { startedOn: "2026-10-01", nextTransferOn: "2026-10-31" } as const;

const normal = (today: string, poolNow: number, spentToday: number) =>
  todayBudget({
    ...cycle,
    today,
    poolNow,
    spentToday,
    spentThisWeekBeforeToday: 0,
    weeklyMode: false,
  });

describe("todayBudget, normal mode", () => {
  it("divides the daily money by the days left", () => {
    // Oct 22 → Oct 30 is 9 days. 90 DT / 9 = 10 DT.
    expect(normal("2026-10-22", 90_000, 0)).toEqual({
      allowance: 10_000,
      spent: 0,
      left: 10_000,
      daysLeft: 9,
      status: "on_track",
      week: null,
    });
  });

  it("subtracts today's spending from today's amount, not from the whole pool", () => {
    // She had 90 DT this morning and bought a 2.5 DT coffee. Now 87.5 DT is left.
    const result = normal("2026-10-22", 87_500, 2_500);
    expect(result.allowance).toBe(10_000); // still 10 DT, unchanged
    expect(result.left).toBe(7_500); // 10 − 2.5
    expect(result.status).toBe("on_track");
  });

  it("shows when she spent more than today's amount", () => {
    const result = normal("2026-10-22", 78_000, 12_000);
    expect(result.allowance).toBe(10_000);
    expect(result.left).toBe(-2_000);
    expect(result.status).toBe("over_today");
  });

  it("rolls unspent money into tomorrow", () => {
    // Yesterday she only spent the 2.5 DT coffee. 87.5 DT / 8 days.
    expect(normal("2026-10-23", 87_500, 0).allowance).toBe(10_937);
  });

  it("lowers tomorrow's amount after overspending", () => {
    // Yesterday she spent 12 DT. 78 DT / 8 days.
    expect(normal("2026-10-23", 78_000, 0).allowance).toBe(9_750);
  });

  it("rounds down to the millime, so it never promises money that doesn't exist", () => {
    // Oct 28 → Oct 30 is 3 days. 10 DT / 3 = 3.333 DT.
    expect(normal("2026-10-28", 10_000, 0).allowance).toBe(3_333);
  });

  it("gives everything left on the last day before the transfer", () => {
    expect(normal("2026-10-30", 6_000, 0)).toMatchObject({ allowance: 6_000, daysLeft: 1 });
  });

  it("treats a late transfer day as the last day", () => {
    // Money expected Oct 31 but it's Nov 2 and nothing arrived.
    // The app must ask for a new expected date; until then, today is the last day.
    expect(normal("2026-11-02", 6_000, 0)).toMatchObject({ allowance: 6_000, daysLeft: 1 });
  });

  it("is zero and over budget when the daily money is already negative", () => {
    expect(normal("2026-10-22", -5_000, 0)).toMatchObject({
      allowance: 0,
      left: 0,
      status: "over_budget",
    });
  });

  it("is over budget when today's spending pushed the daily money below zero", () => {
    // Started the day with 4 DT, spent 5 DT.
    const result = normal("2026-10-22", -1_000, 5_000);
    expect(result.allowance).toBe(444); // 4 DT / 9 days
    expect(result.left).toBe(444 - 5_000);
    expect(result.status).toBe("over_budget");
  });

  it("rejects invalid input", () => {
    expect(() => normal("2026-10-22", 90_000, -1)).toThrow(); // negative spending
    expect(() => normal("2026-10-22", 90_000.5, 0)).toThrow(); // not millimes
    expect(() => normal("2026-09-30", 90_000, 0)).toThrow(); // before the cycle started
  });

  it("rejects a cycle whose next transfer is not after its start", () => {
    const input = {
      today: "2026-10-01",
      poolNow: 90_000,
      spentToday: 0,
      spentThisWeekBeforeToday: 0,
      weeklyMode: false,
    };
    expect(() =>
      todayBudget({ ...input, startedOn: "2026-10-01", nextTransferOn: "2026-10-01" }),
    ).toThrow();
    expect(() =>
      todayBudget({ ...input, startedOn: "2026-10-10", nextTransferOn: "2026-10-01" }),
    ).toThrow();
  });

  // Property-based tests: random daily money, random spending, random day of the cycle.
  const poolAtStartOfDay = fc.integer({ min: 0, max: 10_000_000 });
  const dayOfCycle = fc.integer({ min: 0, max: 29 }).map((n) => addDays(cycle.startedOn, n));
  const withSpending = poolAtStartOfDay.chain((start) =>
    fc.tuple(fc.constant(start), fc.integer({ min: 0, max: start })),
  );

  it("today's amount stays the same all day, whatever she spends", () => {
    fc.assert(
      fc.property(dayOfCycle, withSpending, (today, [start, spent]) => {
        const morning = normal(today, start, 0);
        const later = normal(today, start - spent, spent);
        expect(later.allowance).toBe(morning.allowance);
      }),
    );
  });

  it("left is always today's amount minus today's spending", () => {
    fc.assert(
      fc.property(dayOfCycle, withSpending, (today, [start, spent]) => {
        const result = normal(today, start - spent, spent);
        expect(result.left).toBe(result.allowance - spent);
      }),
    );
  });

  it("never promises more than the money that exists", () => {
    fc.assert(
      fc.property(dayOfCycle, poolAtStartOfDay, (today, start) => {
        const result = normal(today, start, 0);
        expect(result.allowance * result.daysLeft).toBeLessThanOrEqual(start);
        expect(result.allowance).toBeGreaterThanOrEqual(0);
      }),
    );
  });
});

const weekly = (
  today: string,
  poolNow: number,
  spentToday: number,
  spentThisWeekBeforeToday: number,
) =>
  todayBudget({
    ...cycle,
    today,
    poolNow,
    spentToday,
    spentThisWeekBeforeToday,
    weeklyMode: true,
  });

describe("todayBudget, weekly mode", () => {
  // The week's amount is set at the start of the week, as the week's fair share
  // of the daily money: pool × (days in this week) / (days from week start to transfer).
  // Each day then gets an equal share of what's left of the week.

  it("sets the first week's amount and splits it over its 7 days", () => {
    // 300 DT for 30 days. Week 1 gets 300 × 7 / 30 = 70 DT, so 10 DT a day.
    expect(weekly("2026-10-01", 300_000, 0, 0)).toEqual({
      allowance: 10_000,
      spent: 0,
      left: 10_000,
      daysLeft: 30,
      status: "on_track",
      week: { index: 0, allowance: 70_000, left: 70_000, daysLeft: 7 },
    });
  });

  it("protects the rest of the month when she overspends early in the week", () => {
    // She spent 25 DT on Oct 1 and 2. The week's 70 DT has 45 DT left for 5 days.
    const result = weekly("2026-10-03", 275_000, 0, 25_000);
    expect(result.allowance).toBe(9_000);
    expect(result.week).toEqual({ index: 0, allowance: 70_000, left: 45_000, daysLeft: 5 });
    // Normal mode would have allowed more: 275 DT / 28 days = 9.821 DT.
    expect(normal("2026-10-03", 275_000, 0).allowance).toBe(9_821);
  });

  it("subtracts today's spending from the week too", () => {
    const result = weekly("2026-10-03", 272_000, 3_000, 25_000);
    expect(result.allowance).toBe(9_000);
    expect(result.left).toBe(6_000);
    expect(result.week?.left).toBe(42_000); // 70 − 25 − 3
  });

  it("rolls last week's savings into the next week", () => {
    // Week 1 she spent only 60 DT, so 240 DT is left for Oct 8 → Oct 30 (23 days).
    // Week 2 gets 240 × 7 / 23 = 73.043 DT, more than week 1's 70 DT.
    const result = weekly("2026-10-08", 240_000, 0, 0);
    expect(result.week).toEqual({ index: 1, allowance: 73_043, left: 73_043, daysLeft: 7 });
    expect(result.allowance).toBe(10_434); // 73.043 / 7
  });

  it("gives the short last week everything that's left", () => {
    // Oct 29 and 30 are the last 2 days. 20 DT for 2 days.
    const result = weekly("2026-10-29", 20_000, 0, 0);
    expect(result.week).toEqual({ index: 4, allowance: 20_000, left: 20_000, daysLeft: 2 });
    expect(result.allowance).toBe(10_000);
  });

  it("is zero and over budget when the daily money is negative", () => {
    expect(weekly("2026-10-08", -5_000, 0, 0)).toMatchObject({
      allowance: 0,
      status: "over_budget",
      week: { index: 1, allowance: 0 },
    });
  });

  it("rejects negative spending earlier in the week", () => {
    expect(() => weekly("2026-10-03", 275_000, 0, -1)).toThrow();
  });

  it("treats a late transfer day as the last day of the last week", () => {
    // Money expected Oct 31 but it's Nov 2 and nothing arrived. She's still in
    // the last week (Oct 29 → 30), which started with 20 DT; she spent 14 DT
    // since then. Today gets everything left of the week: 6 DT.
    const result = weekly("2026-11-02", 6_000, 0, 14_000);
    expect(result).toEqual({
      allowance: 6_000,
      spent: 0,
      left: 6_000,
      daysLeft: 1,
      status: "on_track",
      week: { index: 4, allowance: 20_000, left: 6_000, daysLeft: 1 },
    });
  });

  it("shows when she spent more than today's amount", () => {
    // Week 1 has 45 DT left for 5 days this morning, so 9 DT today. She spends 15 DT.
    const result = weekly("2026-10-03", 260_000, 15_000, 25_000);
    expect(result).toMatchObject({ allowance: 9_000, left: -6_000, status: "over_today" });
    expect(result.week).toEqual({ index: 0, allowance: 70_000, left: 30_000, daysLeft: 5 });
  });

  it("gives 0 for the rest of the week once the week is overspent", () => {
    // Week 1's amount is 70 DT and she already spent 80 DT. The month still has
    // money (220 DT), but nothing is left for this week.
    expect(weekly("2026-10-03", 220_000, 0, 80_000)).toEqual({
      allowance: 0,
      spent: 0,
      left: 0,
      daysLeft: 28,
      status: "over_week",
      week: { index: 0, allowance: 70_000, left: -10_000, daysLeft: 5 },
    });
  });

  it("is on track when the week is used up exactly", () => {
    // She spent exactly week 1's 70 DT. Nothing left this week, but not over.
    expect(weekly("2026-10-03", 230_000, 0, 70_000)).toMatchObject({
      allowance: 0,
      left: 0,
      status: "on_track",
      week: { index: 0, allowance: 70_000, left: 0, daysLeft: 5 },
    });
  });

  // Property-based tests: random money at the start of the week, random spending
  // earlier in the week and today, random day (including up to 5 days late).
  const weeklyDay = fc.integer({ min: 0, max: 34 }).map((n) => addDays(cycle.startedOn, n));
  const weekSpending = fc
    .integer({ min: 0, max: 10_000_000 })
    .chain((weekStart) =>
      fc
        .integer({ min: 0, max: weekStart })
        .chain((before) =>
          fc.tuple(
            fc.constant(weekStart),
            fc.constant(before),
            fc.integer({ min: 0, max: weekStart - before }),
          ),
        ),
    );

  it("today's amount stays the same all day, whatever she spends", () => {
    fc.assert(
      fc.property(weeklyDay, weekSpending, (today, [weekStart, before, spent]) => {
        const morning = weekly(today, weekStart - before, 0, before);
        const later = weekly(today, weekStart - before - spent, spent, before);
        expect(later.allowance).toBe(morning.allowance);
      }),
    );
  });

  it("week.left is always the week's amount minus everything spent this week", () => {
    fc.assert(
      fc.property(weeklyDay, weekSpending, (today, [weekStart, before, spent]) => {
        const { week } = weekly(today, weekStart - before - spent, spent, before);
        expect(week?.left).toBe((week?.allowance ?? 0) - before - spent);
      }),
    );
  });

  it("never promises more than what was left of the week this morning", () => {
    fc.assert(
      fc.property(weeklyDay, weekSpending, (today, [weekStart, before, spent]) => {
        const result = weekly(today, weekStart - before - spent, spent, before);
        const week = result.week ?? { allowance: 0, daysLeft: 1 };
        // If the week was already overspent, nothing is left: today's amount is 0.
        const leftThisMorning = Math.max(0, week.allowance - before);
        expect(result.allowance * week.daysLeft).toBeLessThanOrEqual(leftThisMorning);
        expect(result.allowance).toBeGreaterThanOrEqual(0);
      }),
    );
  });
});

describe("todayBudget with a stored week amount (ADR 006)", () => {
  const withSnapshot = (
    today: string,
    poolNow: number,
    spentToday: number,
    spentThisWeekBeforeToday: number,
    weekAllowance: number,
  ) =>
    todayBudget({
      ...cycle,
      today,
      poolNow,
      spentToday,
      spentThisWeekBeforeToday,
      weeklyMode: true,
      weekAllowance,
    });

  it("keeps the week's amount when the plan changes mid-week", () => {
    // Week 1 stored 70 DT. On day 3 she adds a 60 DT envelope: the daily money
    // drops from 280 DT to 220 DT, but this week still has 70 − 20 spent = 50 DT.
    const result = withSnapshot("2026-10-03", 220_000, 0, 20_000, 70_000);
    expect(result.week).toEqual({ index: 0, allowance: 70_000, left: 50_000, daysLeft: 5 });
    expect(result.allowance).toBe(10_000);
  });

  it("never promises more than the money that exists this morning", () => {
    // The week stored 70 DT, but only 12 DT of daily money is left.
    const result = withSnapshot("2026-10-03", 12_000, 0, 20_000, 70_000);
    expect(result.week?.left).toBe(12_000);
    expect(result.allowance).toBe(2_400); // 12 DT over 5 days
  });

  it("rejects an invalid stored amount", () => {
    expect(() => withSnapshot("2026-10-03", 1_000, 0, 0, -1)).toThrow(RangeError);
    expect(() => withSnapshot("2026-10-03", 1_000, 0, 0, 1.5)).toThrow(RangeError);
  });

  it("ignores the stored amount in normal mode", () => {
    const result = todayBudget({
      ...cycle,
      today: "2026-10-22",
      poolNow: 90_000,
      spentToday: 0,
      spentThisWeekBeforeToday: 0,
      weeklyMode: false,
      weekAllowance: 1,
    });
    expect(result.allowance).toBe(10_000);
  });

  const day = fc.integer({ min: 0, max: 33 }).map((i) => addDays(cycle.startedOn, i));
  const money = fc.integer({ min: -1_000_000, max: 1_000_000 });
  const spent = fc.integer({ min: 0, max: 500_000 });

  it("gives the same result when the stored amount is the rebuilt one", () => {
    fc.assert(
      fc.property(day, money, spent, spent, (today, poolNow, spentToday, before) => {
        const input = { ...cycle, today, poolNow, spentToday, spentThisWeekBeforeToday: before };
        const week = weekStartAllowance(input);
        const rebuilt = todayBudget({ ...input, weeklyMode: true });
        expect(rebuilt.week?.allowance).toBe(week.allowance);
        expect(todayBudget({ ...input, weeklyMode: true, weekAllowance: week.allowance })).toEqual(
          rebuilt,
        );
      }),
    );
  });

  it("never gives the rest of the week more than this morning's money", () => {
    fc.assert(
      fc.property(
        day,
        money,
        spent,
        spent,
        fc.integer({ min: 0, max: 2_000_000 }),
        (today, poolNow, spentToday, before, weekAllowance) => {
          const result = todayBudget({
            ...cycle,
            today,
            poolNow,
            spentToday,
            spentThisWeekBeforeToday: before,
            weeklyMode: true,
            weekAllowance,
          });
          const week = result.week;
          expect(week).not.toBeNull();
          expect(result.allowance * (week?.daysLeft ?? 1)).toBeLessThanOrEqual(
            Math.max(0, poolNow + spentToday),
          );
        },
      ),
    );
  });
});

describe("weekStartAllowance", () => {
  it("gives the week's dates and its share of the money it started with", () => {
    // Day 10 (week 2, Oct 8–14). 230 DT now + 5 spent today + 10 earlier this
    // week = 245 DT at the week's start, shared over Oct 8–30: 245 × 7 / 23.
    expect(
      weekStartAllowance({
        ...cycle,
        today: "2026-10-10",
        poolNow: 230_000,
        spentToday: 5_000,
        spentThisWeekBeforeToday: 10_000,
      }),
    ).toEqual({ index: 1, start: "2026-10-08", end: "2026-10-14", allowance: 74_565 });
  });

  it("rejects invalid input", () => {
    const base = { ...cycle, today: "2026-10-10", poolNow: 0, spentToday: 0 };
    expect(() => weekStartAllowance({ ...base, spentThisWeekBeforeToday: -1 })).toThrow(RangeError);
    expect(() =>
      weekStartAllowance({ ...base, poolNow: 0.5, spentThisWeekBeforeToday: 0 }),
    ).toThrow(RangeError);
  });
});
