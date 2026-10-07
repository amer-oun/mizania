import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { checkIn, expectedBalance } from "./checkin";

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
