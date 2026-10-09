import { describe, expect, it } from "vitest";

import { PLAN_MAX_ITEMS, savePlanSchema } from "./month-plan";

const a = "6b1f1c1e-6a8e-4c43-9a55-0c1f0f8f1a01";
const b = "6b1f1c1e-6a8e-4c43-9a55-0c1f0f8f1a02";
const c = "6b1f1c1e-6a8e-4c43-9a55-0c1f0f8f1a03";
const rent = { id: b, kind: "fixed", categoryId: c, amountMillimes: 250_000 };
const savings = { id: c, kind: "savings", categoryId: null, amountMillimes: 50_000 };
const valid = { cycleId: a, items: [rent, savings] };

describe("savePlanSchema", () => {
  it("accepts a whole plan, or an empty one", () => {
    expect(savePlanSchema.parse(valid)).toEqual(valid);
    expect(savePlanSchema.safeParse({ cycleId: a, items: [] }).success).toBe(true);
  });

  it.each<[string, unknown]>([
    ["an amount of 0", { ...valid, items: [{ ...rent, amountMillimes: 0 }] }],
    ["an amount with decimals", { ...valid, items: [{ ...rent, amountMillimes: 1.5 }] }],
    ["an unknown kind", { ...valid, items: [{ ...rent, kind: "daily" }] }],
    ["an item ID that isn't a UUID", { ...valid, items: [{ ...rent, id: "rent" }] }],
    ["no category field", { ...valid, items: [{ ...rent, categoryId: undefined }] }],
    ["an extra item field", { ...valid, items: [{ ...rent, paidAt: "2026-10-01" }] }],
    ["no cycle", { items: [] }],
    ["an extra field", { ...valid, userId: a }],
    [
      "too many items",
      { cycleId: a, items: Array.from({ length: PLAN_MAX_ITEMS + 1 }, () => rent) },
    ],
  ])("refuses %s", (_, value) => {
    expect(savePlanSchema.safeParse(value).success).toBe(false);
  });
});
