import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { addDays, daysBetween, nextTransferDate } from "./cycle";

describe("nextTransferDate", () => {
  it.each([
    // today, arrival day, expected
    ["2026-10-08", 15, "2026-10-15"], // later this month
    ["2026-10-08", 1, "2026-11-01"], // already passed: next month
    ["2026-10-08", 8, "2026-11-08"], // today is the arrival day: the next one
    ["2026-12-20", 5, "2027-01-05"], // across the year end
    ["2026-11-10", 31, "2026-11-30"], // 30-day month
    ["2027-02-01", 31, "2027-02-28"], // February
    ["2028-02-01", 30, "2028-02-29"], // leap year
    ["2027-01-31", 31, "2027-02-28"], // on the 31st, next is end of February
    ["2027-02-28", 31, "2027-03-31"], // end of February counts as day 31 that month
    ["2026-10-31", 31, "2026-11-30"],
  ])("from %s, arrival day %i → %s", (today, day, expected) => {
    expect(nextTransferDate(today, day)).toBe(expected);
  });

  it.each([[0], [32], [1.5], [Number.NaN]])("rejects arrival day %s", (day) => {
    expect(() => nextTransferDate("2026-10-08", day)).toThrow(RangeError);
  });

  it("rejects an invalid today", () => {
    expect(() => nextTransferDate("2026-02-30", 5)).toThrow(RangeError);
  });

  const anyDay = fc
    .integer({ min: 0, max: 365 * 40 })
    .map((offset) => addDays("2000-01-01", offset));

  it("is always strictly after today and at most 31 days later", () => {
    fc.assert(
      fc.property(anyDay, fc.integer({ min: 1, max: 31 }), (today, day) => {
        const gap = daysBetween(today, nextTransferDate(today, day));
        expect(gap).toBeGreaterThanOrEqual(1);
        expect(gap).toBeLessThanOrEqual(31);
      }),
    );
  });

  it("lands on the arrival day, or on the last day of a shorter month", () => {
    fc.assert(
      fc.property(anyDay, fc.integer({ min: 1, max: 31 }), (today, day) => {
        const next = nextTransferDate(today, day);
        const dayOfMonth = Number(next.slice(8));
        const isLastDay = addDays(next, 1).endsWith("-01");
        expect(dayOfMonth === day || (dayOfMonth < day && isLastDay)).toBe(true);
      }),
    );
  });

  it("is the first such date: no earlier day after today qualifies", () => {
    fc.assert(
      fc.property(anyDay, fc.integer({ min: 1, max: 31 }), (today, day) => {
        const next = nextTransferDate(today, day);
        // Asking from the day before the answer gives the same answer.
        expect(nextTransferDate(addDays(next, -1), day)).toBe(next);
      }),
    );
  });
});
