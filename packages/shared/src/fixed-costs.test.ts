import { describe, expect, it } from "vitest";

import { payFixedCostSchema, planItemIdSchema } from "./fixed-costs";

const a = "6b1f1c1e-6a8e-4c43-9a55-0c1f0f8f1a01";
const b = "6b1f1c1e-6a8e-4c43-9a55-0c1f0f8f1a02";
const c = "6b1f1c1e-6a8e-4c43-9a55-0c1f0f8f1a03";
const valid = { id: a, planItemId: b, amountMillimes: 250_000, walletId: c, final: true };

describe("payFixedCostSchema", () => {
  it("accepts a payment, final or not", () => {
    expect(payFixedCostSchema.parse(valid)).toEqual(valid);
    expect(payFixedCostSchema.safeParse({ ...valid, final: false }).success).toBe(true);
  });

  it.each<[string, unknown]>([
    ["an amount of 0", { ...valid, amountMillimes: 0 }],
    ["an amount with decimals", { ...valid, amountMillimes: 1.5 }],
    ["no 'final'", { ...valid, final: undefined }],
    ["a plan item that isn't a UUID", { ...valid, planItemId: "rent" }],
    ["no client ID", { ...valid, id: undefined }],
    ["an extra field", { ...valid, userId: a }],
  ])("refuses %s", (_, value) => {
    expect(payFixedCostSchema.safeParse(value).success).toBe(false);
  });
});

describe("planItemIdSchema", () => {
  it("takes a plan item ID", () => {
    expect(planItemIdSchema.safeParse({ planItemId: a }).success).toBe(true);
    expect(planItemIdSchema.safeParse({ planItemId: "x" }).success).toBe(false);
    expect(planItemIdSchema.safeParse({ planItemId: a, userId: b }).success).toBe(false);
  });
});
