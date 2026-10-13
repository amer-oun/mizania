import { describe, expect, it } from "vitest";

import {
  incomeIdSchema,
  moveExpectedDateSchema,
  receiveExtraSchema,
  startNewMonthSchema,
} from "./received";

const a = "6b1f1c1e-6a8e-4c43-9a55-0c1f0f8f1a01";
const b = "6b1f1c1e-6a8e-4c43-9a55-0c1f0f8f1a02";
const c = "6b1f1c1e-6a8e-4c43-9a55-0c1f0f8f1a03";
const extra = { id: a, amountMillimes: 150_000, walletId: b, source: "bourse" };
const month = {
  cycleId: a,
  incomeId: b,
  amountMillimes: 600_000,
  walletId: c,
  source: "parents",
  expectedNextOn: "2026-11-30",
  items: [{ id: c, kind: "fixed", categoryId: a, amountMillimes: 250_000 }],
};

describe("receiveExtraSchema", () => {
  it("accepts money from each source", () => {
    expect(receiveExtraSchema.parse(extra)).toEqual(extra);
    for (const source of ["parents", "bourse", "job", "other"]) {
      expect(receiveExtraSchema.safeParse({ ...extra, source }).success).toBe(true);
    }
  });

  it.each<[string, unknown]>([
    ["an amount of 0", { ...extra, amountMillimes: 0 }],
    ["an amount with decimals", { ...extra, amountMillimes: 1.5 }],
    ["an unknown source", { ...extra, source: "lottery" }],
    ["no client ID", { ...extra, id: undefined }],
    ["an extra field", { ...extra, userId: a }],
  ])("refuses %s", (_, value) => {
    expect(receiveExtraSchema.safeParse(value).success).toBe(false);
  });
});

describe("startNewMonthSchema", () => {
  it("accepts a new month with its plan, or an empty plan", () => {
    expect(startNewMonthSchema.parse(month)).toEqual(month);
    expect(startNewMonthSchema.safeParse({ ...month, items: [] }).success).toBe(true);
  });

  it.each<[string, unknown]>([
    ["a date that doesn't exist", { ...month, expectedNextOn: "2026-02-30" }],
    ["a date in another format", { ...month, expectedNextOn: "30/11/2026" }],
    ["no source", { ...month, source: undefined }],
    [
      "an item with an amount of 0",
      { ...month, items: [{ ...month.items[0], amountMillimes: 0 }] },
    ],
    ["an extra field", { ...month, userId: a }],
  ])("refuses %s", (_, value) => {
    expect(startNewMonthSchema.safeParse(value).success).toBe(false);
  });
});

describe("moveExpectedDateSchema and incomeIdSchema", () => {
  it("take a cycle and a date, and an income ID", () => {
    expect(moveExpectedDateSchema.safeParse({ cycleId: a, expectedOn: "2026-11-02" }).success).toBe(
      true,
    );
    expect(moveExpectedDateSchema.safeParse({ cycleId: a, expectedOn: "tomorrow" }).success).toBe(
      false,
    );
    expect(incomeIdSchema.safeParse({ id: a }).success).toBe(true);
    expect(incomeIdSchema.safeParse({ id: "x" }).success).toBe(false);
  });
});
