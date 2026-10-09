import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  assertMillimes,
  formatTND,
  formatTypedTND,
  millimesReading,
  parseTND,
  splitEven,
} from "./money";

// Money is always an integer number of millimes: 1 TND = 1000 millimes.

describe("assertMillimes", () => {
  it("accepts integers, including zero and negatives", () => {
    expect(() => {
      assertMillimes(0);
    }).not.toThrow();
    expect(() => {
      assertMillimes(2500);
    }).not.toThrow();
    expect(() => {
      assertMillimes(-2500);
    }).not.toThrow();
  });

  it("rejects non-integers, NaN, Infinity and unsafe integers", () => {
    expect(() => {
      assertMillimes(2.5);
    }).toThrow();
    expect(() => {
      assertMillimes(Number.NaN);
    }).toThrow();
    expect(() => {
      assertMillimes(Number.POSITIVE_INFINITY);
    }).toThrow();
    expect(() => {
      assertMillimes(Number.MAX_SAFE_INTEGER + 1);
    }).toThrow();
  });
});

describe("parseTND", () => {
  // Input comes from the quick-entry keypad or a text field.
  // Both "." and "," are decimal separators. No thousands separators.
  it.each([
    ["12", 12_000],
    ["2.5", 2_500],
    ["2,5", 2_500],
    ["2.500", 2_500],
    ["2,500", 2_500],
    ["0.005", 5],
    ["0", 0],
    ["350", 350_000],
    [" 12 ", 12_000],
    [".5", 500],
    ["٢٫٥", 2_500], // Arabic-Indic digits and Arabic decimal separator
    ["١٢", 12_000],
  ])("parses %j as %i millimes", (input, expected) => {
    expect(parseTND(input)).toBe(expected);
  });

  it.each([
    [""],
    ["   "],
    ["abc"],
    ["2.5555"], // more than 3 decimals: millimes are the smallest unit
    ["-3"], // amounts are entered as positive numbers
    ["1.2.3"],
    ["2,5.0"],
    ["12dt"],
    ["5."],
  ])("returns null for %j", (input) => {
    expect(parseTND(input)).toBeNull();
  });

  it("returns null for an amount too large to store exactly", () => {
    expect(parseTND("99999999999999999")).toBeNull();
  });
});

describe("formatTND", () => {
  // Always 3 decimals. Formatting is done by hand, not Intl,
  // so output is identical on every device and in CI.
  it.each([
    [2_500, "en", "2.500 DT"],
    [2_500, "fr", "2,500 DT"],
    [2_500, "ar", "2,500 د.ت"],
    [0, "fr", "0,000 DT"],
    [5, "en", "0.005 DT"],
    [1_250_500, "en", "1,250.500 DT"],
    [1_250_500, "fr", "1 250,500 DT"],
    [1_250_500, "ar", "1 250,500 د.ت"],
    [-2_500, "fr", "-2,500 DT"],
    [1_000_000_000, "en", "1,000,000.000 DT"],
  ] as const)("formats %i in %s as %j", (millimes, locale, expected) => {
    expect(formatTND(millimes, locale)).toBe(expected);
  });

  it("throws on non-integer input", () => {
    expect(() => formatTND(2.5, "fr")).toThrow();
  });
});

describe("splitEven", () => {
  it("splits evenly when possible", () => {
    expect(splitEven(9_000, 3)).toEqual([3_000, 3_000, 3_000]);
  });

  it("gives the remainder millimes to the first shares", () => {
    expect(splitEven(10_000, 3)).toEqual([3_334, 3_333, 3_333]);
    expect(splitEven(10_001, 3)).toEqual([3_334, 3_334, 3_333]);
  });

  it("handles zero and a single person", () => {
    expect(splitEven(0, 4)).toEqual([0, 0, 0, 0]);
    expect(splitEven(7_777, 1)).toEqual([7_777]);
  });

  it("throws for invalid input", () => {
    expect(() => splitEven(10_000, 0)).toThrow();
    expect(() => splitEven(10_000, -2)).toThrow();
    expect(() => splitEven(10_000, 1.5)).toThrow();
    expect(() => splitEven(-10_000, 2)).toThrow();
    expect(() => splitEven(2.5, 2)).toThrow();
  });

  // Property-based tests: fast-check tries hundreds of random inputs.
  const total = fc.integer({ min: 0, max: 100_000_000 });
  const people = fc.integer({ min: 1, max: 50 });

  it("always returns exactly n shares", () => {
    fc.assert(
      fc.property(total, people, (t, n) => {
        expect(splitEven(t, n)).toHaveLength(n);
      }),
    );
  });

  it("shares always add up to the total", () => {
    fc.assert(
      fc.property(total, people, (t, n) => {
        const sum = splitEven(t, n).reduce((a, b) => a + b, 0);
        expect(sum).toBe(t);
      }),
    );
  });

  it("no two shares differ by more than 1 millime", () => {
    fc.assert(
      fc.property(total, people, (t, n) => {
        const shares = splitEven(t, n);
        expect(Math.max(...shares) - Math.min(...shares)).toBeLessThanOrEqual(1);
      }),
    );
  });

  it("shares are sorted from largest to smallest", () => {
    fc.assert(
      fc.property(total, people, (t, n) => {
        const shares = splitEven(t, n);
        const sorted = [...shares].sort((a, b) => b - a);
        expect(shares).toEqual(sorted);
      }),
    );
  });
});

describe("millimesReading", () => {
  it("reads a whole number of 1000 or more as millimes", () => {
    expect(millimesReading("2500")).toBe(2_500);
    expect(millimesReading(" ٢٥٠٠ ")).toBe(2_500);
    expect(millimesReading("1000")).toBe(1_000);
    expect(millimesReading("12000")).toBe(12_000);
  });

  it("offers nothing for small numbers, decimals, other input or huge numbers", () => {
    expect(millimesReading("999")).toBeNull();
    expect(millimesReading("15")).toBeNull();
    expect(millimesReading("2.5")).toBeNull();
    expect(millimesReading("2500.0")).toBeNull();
    expect(millimesReading("٢٫٥")).toBeNull();
    expect(millimesReading("")).toBeNull();
    expect(millimesReading("abc")).toBeNull();
    expect(millimesReading("99999999999999999999")).toBeNull();
  });

  it("is exactly the typed number, which parseTND reads as 1000 times more", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1000, max: 1_000_000_000 }), (n) => {
        expect(millimesReading(String(n))).toBe(n);
        expect(parseTND(String(n))).toBe(n * 1000);
      }),
    );
  });
});

describe("formatTypedTND", () => {
  it.each([
    [250_000, "250"],
    [12_500, "12.5"],
    [2_050, "2.05"],
    [50, "0.05"],
    [1, "0.001"],
    [0, "0"],
    [1_234_567, "1234.567"],
  ])("%i millimes → %s", (millimes, typed) => {
    expect(formatTypedTND(millimes)).toBe(typed);
  });

  it("refuses negative or fractional amounts", () => {
    expect(() => formatTypedTND(-1)).toThrow(RangeError);
    expect(() => formatTypedTND(1.5)).toThrow(RangeError);
  });

  it("is read back exactly by parseTND", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: Number.MAX_SAFE_INTEGER }), (millimes) => {
        expect(parseTND(formatTypedTND(millimes))).toBe(millimes);
      }),
    );
  });
});
