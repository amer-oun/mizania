import { describe, expect, it } from "vitest";

import { categorizeUnloggedSchema, checkInIdSchema, checkInSchema } from "./checkin";

const a = "6b1f1c1e-6a8e-4c43-9a55-0c1f0f8f1a01";
const b = "6b1f1c1e-6a8e-4c43-9a55-0c1f0f8f1a02";
const count = { id: a, walletId: b, countedMillimes: 32_000 };

describe("checkInSchema", () => {
  it("accepts a count, an empty wallet, and an answer", () => {
    expect(checkInSchema.parse(count)).toEqual(count);
    expect(checkInSchema.safeParse({ ...count, countedMillimes: 0 }).success).toBe(true);
    const answered = { ...count, answer: "income", source: "parents", seenMillimes: 5_000 };
    expect(checkInSchema.safeParse(answered).success).toBe(true);
  });

  it.each<[string, unknown]>([
    ["a negative count", { ...count, countedMillimes: -1 }],
    ["a count with decimals", { ...count, countedMillimes: 1.5 }],
    ["an unknown answer", { ...count, answer: "gift" }],
    ["a seen difference of 0", { ...count, answer: "correction", seenMillimes: 0 }],
    ["no client ID", { ...count, id: undefined }],
    ["an extra field", { ...count, userId: a }],
  ])("refuses %s", (_, value) => {
    expect(checkInSchema.safeParse(value).success).toBe(false);
  });
});

describe("checkInIdSchema and categorizeUnloggedSchema", () => {
  it("take IDs only", () => {
    expect(checkInIdSchema.safeParse({ id: a }).success).toBe(true);
    expect(checkInIdSchema.safeParse({ id: "x" }).success).toBe(false);
    expect(categorizeUnloggedSchema.safeParse({ transactionId: a, categoryId: b }).success).toBe(
      true,
    );
    expect(categorizeUnloggedSchema.safeParse({ transactionId: a }).success).toBe(false);
  });
});
