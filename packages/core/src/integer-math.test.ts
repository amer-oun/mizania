import { describe, expect, it } from "vitest";

import { mulDivFloor } from "./integer-math";

// Internal helper, tested directly. Its normal results are covered through
// daily.ts and warnings.ts; this file covers the overflow refusal.

describe("mulDivFloor", () => {
  it("computes floor(amount × part / whole) exactly", () => {
    expect(mulDivFloor(300_000, 7, 30)).toBe(70_000);
    expect(mulDivFloor(240_000, 7, 23)).toBe(73_043);
    expect(mulDivFloor(Number.MAX_SAFE_INTEGER, 7, 8)).toBe(7_881_299_347_898_367);
  });

  it("refuses a result too large to store exactly", () => {
    expect(() => mulDivFloor(Number.MAX_SAFE_INTEGER, 7, 1)).toThrow(RangeError);
  });
});
