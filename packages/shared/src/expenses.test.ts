import { describe, expect, it } from "vitest";

import { expenseIdSchema, logExpenseSchema } from "./expenses";

const a = "6b1f1c1e-6a8e-4c43-9a55-0c1f0f8f1a01";
const b = "6b1f1c1e-6a8e-4c43-9a55-0c1f0f8f1a02";
const c = "6b1f1c1e-6a8e-4c43-9a55-0c1f0f8f1a03";
const valid = { id: a, amountMillimes: 2_500, categoryId: b, walletId: c };

describe("logExpenseSchema", () => {
  it("accepts an expense", () => {
    expect(logExpenseSchema.parse(valid)).toEqual(valid);
  });

  it.each<[string, unknown]>([
    ["an amount of 0", { ...valid, amountMillimes: 0 }],
    ["a negative amount", { ...valid, amountMillimes: -1 }],
    ["an amount in dinars with decimals", { ...valid, amountMillimes: 2.5 }],
    ["an amount sent as text", { ...valid, amountMillimes: "2500" }],
    ["no client ID", { ...valid, id: undefined }],
    ["a category that isn't a UUID", { ...valid, categoryId: "coffee" }],
    ["no wallet", { ...valid, walletId: undefined }],
    ["an extra field", { ...valid, userId: a }],
    ["a date chosen by the client", { ...valid, occurredAt: "2026-10-01T10:00:00Z" }],
  ])("refuses %s", (_, value) => {
    expect(logExpenseSchema.safeParse(value).success).toBe(false);
  });
});

describe("expenseIdSchema", () => {
  it("takes a transaction ID", () => {
    expect(expenseIdSchema.safeParse({ transactionId: a }).success).toBe(true);
    expect(expenseIdSchema.safeParse({ transactionId: "1" }).success).toBe(false);
    expect(expenseIdSchema.safeParse({ transactionId: a, userId: b }).success).toBe(false);
  });
});
