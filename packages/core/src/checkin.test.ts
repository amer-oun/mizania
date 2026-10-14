import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { checkIn, checkInRecord, expectedBalance, isCheckinEvening, timeInTunis } from "./checkin";

// Evening check-in: instead of logging every coffee, the student says how much
// is really left in a wallet (for example, her cash). The app compares it with
// what it expected and records the difference.

describe("expectedBalance", () => {
  it("is the last confirmed balance plus money in, minus money out", () => {
    // Last check-in: 20 DT. Since then she logged 5 DT received and 12.5 DT spent.
    expect(expectedBalance(20_000, 5_000, 12_500)).toBe(12_500);
  });

  it("can be negative when more spending was logged than the money recorded", () => {
    expect(expectedBalance(5_000, 0, 8_000)).toBe(-3_000);
  });

  it("rejects invalid amounts", () => {
    expect(() => expectedBalance(20_000, -1, 0)).toThrow(); // money in can't be negative
    expect(() => expectedBalance(20_000, 0, -1)).toThrow(); // money out can't be negative
    expect(() => expectedBalance(20_000.5, 0, 0)).toThrow();
  });
});

describe("checkIn", () => {
  it("finds spending she didn't log", () => {
    // The app expected 12.5 DT, she counts 8 DT: 4.5 DT went somewhere.
    expect(checkIn(12_500, 8_000)).toEqual({ kind: "unlogged_spending", amount: 4_500 });
  });

  it("finds money she didn't log receiving", () => {
    // She has more than expected: maybe a friend paid her back.
    expect(checkIn(12_500, 15_000)).toEqual({ kind: "unlogged_income", amount: 2_500 });
  });

  it("matches when everything was logged", () => {
    expect(checkIn(12_500, 12_500)).toEqual({ kind: "match", amount: 0 });
  });

  it("handles a negative expected balance", () => {
    // The app expected −3 DT (impossible in a real pocket); she has 0 DT.
    expect(checkIn(-3_000, 0)).toEqual({ kind: "unlogged_income", amount: 3_000 });
  });

  it("rejects a negative or non-integer reported balance", () => {
    expect(() => checkIn(12_500, -1)).toThrow(); // a wallet can't hold less than 0
    expect(() => checkIn(12_500, 8_000.5)).toThrow();
    expect(() => checkIn(12_500.5, 8_000)).toThrow();
  });

  const expected = fc.integer({ min: -1_000_000, max: 10_000_000 });
  const reported = fc.integer({ min: 0, max: 10_000_000 });

  it("the amount is never negative", () => {
    fc.assert(
      fc.property(expected, reported, (e, r) => {
        expect(checkIn(e, r).amount).toBeGreaterThanOrEqual(0);
      }),
    );
  });

  it("after recording the difference, the balance matches what she counted", () => {
    fc.assert(
      fc.property(expected, reported, (e, r) => {
        const result = checkIn(e, r);
        const corrected =
          result.kind === "unlogged_spending" ? e - result.amount : e + result.amount;
        expect(corrected).toBe(r);
      }),
    );
  });
});

describe("checkInRecord", () => {
  it("records nothing for a match, and the unlogged spending for less", () => {
    expect(checkInRecord(checkIn(40_000, 40_000))).toBeNull();
    expect(checkInRecord(checkIn(40_000, 32_000))).toEqual({
      type: "expense",
      amountMillimes: 8_000,
    });
  });

  it("waits for an answer when she counted more, then records income or a correction", () => {
    const more = checkIn(40_000, 45_000);
    expect(checkInRecord(more)).toBe("needs-answer");
    expect(checkInRecord(more, "income")).toEqual({ type: "income", amountMillimes: 5_000 });
    expect(checkInRecord(more, "correction")).toEqual({
      type: "adjustment",
      amountMillimes: 5_000,
    });
  });

  it("always brings the wallet to what she counted", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -500_000, max: 500_000 }),
        fc.integer({ min: 0, max: 500_000 }),
        fc.constantFrom("income" as const, "correction" as const),
        (expected, counted, answer) => {
          const record = checkInRecord(checkIn(expected, counted), answer);
          if (record === "needs-answer") throw new Error("answered");
          const change =
            record === null
              ? 0
              : record.type === "expense"
                ? -record.amountMillimes
                : record.amountMillimes;
          expect(expected + change).toBe(counted);
        },
      ),
    );
  });
});

describe("the evening window", () => {
  // Tunis is UTC+1 all year.
  const at = (time: string) => new Date(`2026-10-14T${time}:00+01:00`);

  it("tells the time in Tunis", () => {
    expect(timeInTunis(at("07:05"))).toBe("07:05");
    expect(timeInTunis(at("23:59"))).toBe("23:59");
    expect(() => timeInTunis(new Date("nope"))).toThrow(RangeError);
  });

  it("opens at 18:00, or earlier at the student's own check-in time, until midnight", () => {
    expect(isCheckinEvening(at("17:59"), "21:00:00")).toBe(false);
    expect(isCheckinEvening(at("18:00"), "21:00:00")).toBe(true);
    expect(isCheckinEvening(at("23:59"), "21:00")).toBe(true);
    expect(isCheckinEvening(at("00:30"), "21:00")).toBe(false);
    expect(isCheckinEvening(at("16:30"), "16:30")).toBe(true);
    expect(isCheckinEvening(at("16:29"), "16:30")).toBe(false);
  });

  it("refuses a check-in time that isn't one", () => {
    expect(() => isCheckinEvening(at("20:00"), "9pm")).toThrow(RangeError);
    expect(() => isCheckinEvening(at("20:00"), "24:00")).toThrow(RangeError);
  });
});
