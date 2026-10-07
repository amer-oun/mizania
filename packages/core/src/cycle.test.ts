import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  addDays,
  assertIsoDate,
  cycleWeeks,
  daysBetween,
  daysLeft,
  isTransferDue,
  todayInTunis,
  weekIndexFor,
} from "./cycle";

// Dates are calendar days in Tunisia, written as "YYYY-MM-DD" strings.
// No times, no Date objects in the public API: this avoids time-zone bugs.

describe("assertIsoDate", () => {
  it.each([["2026-10-07"], ["2028-02-29"], ["2026-12-31"]])("accepts %j", (d) => {
    expect(() => {
      assertIsoDate(d);
    }).not.toThrow();
  });

  it.each([
    ["2026-02-30"], // no such day
    ["2027-02-29"], // not a leap year
    ["2026-13-01"],
    ["2026-00-10"],
    ["2026-1-5"],
    ["05/10/2026"],
    ["2026-10-07T10:00"],
    [""],
  ])("rejects %j", (d) => {
    expect(() => {
      assertIsoDate(d);
    }).toThrow();
  });
});

describe("todayInTunis", () => {
  // Tunisia is UTC+1. A student opening the app at 00:30 in Tunis
  // must already be on the new day, even though it's 23:30 in UTC.
  it.each([
    ["2026-10-06T23:30:00Z", "2026-10-07"],
    ["2026-10-07T00:00:00Z", "2026-10-07"],
    ["2026-10-07T22:59:59Z", "2026-10-07"],
    ["2026-10-07T23:00:00Z", "2026-10-08"],
    ["2026-12-31T23:15:00Z", "2027-01-01"],
  ])("at %s UTC it is %s in Tunis", (instant, expected) => {
    expect(todayInTunis(new Date(instant))).toBe(expected);
  });

  it("rejects an invalid date", () => {
    expect(() => todayInTunis(new Date("not a date"))).toThrow();
  });
});

describe("daysBetween", () => {
  it.each([
    ["2026-10-01", "2026-10-31", 30],
    ["2026-10-07", "2026-10-07", 0],
    ["2026-01-31", "2026-02-01", 1],
    ["2027-02-28", "2027-03-01", 1], // not a leap year
    ["2028-02-28", "2028-03-01", 2], // leap year
    ["2026-12-31", "2027-01-01", 1],
    ["2026-10-10", "2026-10-01", -9],
  ])("from %s to %s is %i days", (from, to, expected) => {
    expect(daysBetween(from, to)).toBe(expected);
  });
});

describe("addDays", () => {
  it.each([
    ["2026-01-31", 1, "2026-02-01"],
    ["2026-03-01", -1, "2026-02-28"],
    ["2028-03-01", -1, "2028-02-29"],
    ["2026-12-31", 1, "2027-01-01"],
    ["2026-10-07", 0, "2026-10-07"],
    ["2026-10-01", 30, "2026-10-31"],
  ])("%s + %i days = %s", (date, days, expected) => {
    expect(addDays(date, days)).toBe(expected);
  });

  it("rejects a number of days that isn't a whole number", () => {
    expect(() => addDays("2026-10-07", 1.5)).toThrow();
    expect(() => addDays("2026-10-07", Number.NaN)).toThrow();
  });
});

describe("daysLeft", () => {
  // Days the student must live on the current money:
  // from today (included) until the transfer day (not included).
  it("counts today but not the transfer day", () => {
    expect(daysLeft("2026-10-21", "2026-10-30")).toBe(9);
    expect(daysLeft("2026-10-29", "2026-10-30")).toBe(1);
  });

  it("is never less than 1, even when the transfer is due or late", () => {
    // The student still has to live today while waiting for the money.
    expect(daysLeft("2026-10-30", "2026-10-30")).toBe(1);
    expect(daysLeft("2026-11-02", "2026-10-30")).toBe(1);
  });
});

describe("isTransferDue", () => {
  it("is false before the expected date", () => {
    expect(isTransferDue("2026-10-29", "2026-10-30")).toBe(false);
  });

  it("is true on and after the expected date", () => {
    expect(isTransferDue("2026-10-30", "2026-10-30")).toBe(true);
    expect(isTransferDue("2026-11-02", "2026-10-30")).toBe(true);
  });
});

describe("cycleWeeks", () => {
  // A cycle runs from the day money arrived until the day before the next transfer.
  // It's cut into 7-day weeks from the start; only the last week can be shorter.
  it("splits a 30-day cycle into 4 full weeks and 2 extra days", () => {
    expect(cycleWeeks("2026-10-01", "2026-10-31")).toEqual([
      { start: "2026-10-01", end: "2026-10-07", days: 7 },
      { start: "2026-10-08", end: "2026-10-14", days: 7 },
      { start: "2026-10-15", end: "2026-10-21", days: 7 },
      { start: "2026-10-22", end: "2026-10-28", days: 7 },
      { start: "2026-10-29", end: "2026-10-30", days: 2 },
    ]);
  });

  it("works across months and years", () => {
    expect(cycleWeeks("2026-12-28", "2027-01-11")).toEqual([
      { start: "2026-12-28", end: "2027-01-03", days: 7 },
      { start: "2027-01-04", end: "2027-01-10", days: 7 },
    ]);
  });

  it("handles a cycle shorter than a week", () => {
    expect(cycleWeeks("2026-10-01", "2026-10-04")).toEqual([
      { start: "2026-10-01", end: "2026-10-03", days: 3 },
    ]);
  });

  it("throws when the next transfer is not after the start", () => {
    expect(() => cycleWeeks("2026-10-01", "2026-10-01")).toThrow();
    expect(() => cycleWeeks("2026-10-10", "2026-10-01")).toThrow();
  });

  // Property-based tests over random cycles from 1 to 62 days.
  const start = fc
    .date({
      min: new Date("2025-01-01T00:00:00Z"),
      max: new Date("2030-12-31T00:00:00Z"),
      noInvalidDate: true,
    })
    .map((d) => d.toISOString().slice(0, 10));
  const length = fc.integer({ min: 1, max: 62 });

  it("weeks cover the whole cycle with no gaps or overlaps", () => {
    fc.assert(
      fc.property(start, length, (s, len) => {
        const next = addDays(s, len);
        const weeks = cycleWeeks(s, next);

        expect(weeks[0]?.start).toBe(s);
        expect(weeks.at(-1)?.end).toBe(addDays(next, -1));
        expect(weeks.reduce((sum, w) => sum + w.days, 0)).toBe(len);

        for (let i = 1; i < weeks.length; i++) {
          expect(weeks[i]?.start).toBe(addDays(weeks[i - 1]?.end ?? "", 1));
        }
      }),
    );
  });

  it("every week has 7 days except possibly the last", () => {
    fc.assert(
      fc.property(start, length, (s, len) => {
        const weeks = cycleWeeks(s, addDays(s, len));
        weeks.slice(0, -1).forEach((w) => {
          expect(w.days).toBe(7);
        });
        const last = weeks.at(-1);
        expect(last?.days).toBeGreaterThanOrEqual(1);
        expect(last?.days).toBeLessThanOrEqual(7);
      }),
    );
  });
});

describe("weekIndexFor", () => {
  const weeks = () => cycleWeeks("2026-10-01", "2026-10-31");

  it("finds the week that contains today", () => {
    expect(weekIndexFor("2026-10-01", weeks())).toBe(0);
    expect(weekIndexFor("2026-10-07", weeks())).toBe(0);
    expect(weekIndexFor("2026-10-08", weeks())).toBe(1);
    expect(weekIndexFor("2026-10-30", weeks())).toBe(4);
  });

  it("stays on the last week when the transfer is late", () => {
    expect(weekIndexFor("2026-11-03", weeks())).toBe(4);
  });

  it("throws when today is before the cycle starts", () => {
    expect(() => weekIndexFor("2026-09-30", weeks())).toThrow();
  });

  it("throws when the cycle has no weeks", () => {
    expect(() => weekIndexFor("2026-10-01", [])).toThrow();
  });
});
