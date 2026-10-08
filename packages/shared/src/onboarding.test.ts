import { describe, expect, it } from "vitest";

import { type OnboardingInput, onboardingInputSchema } from "./onboarding";

const valid: OnboardingInput = {
  locale: "ar",
  monthlyMillimes: 600_000,
  arrivalDay: 31,
  fixedCosts: [{ key: "rent", amountMillimes: 250_000, alreadyPaid: false }],
  wallets: [
    { kind: "cash", balanceMillimes: 0 },
    { kind: "other", name: " Tirelire ", balanceMillimes: 5_000 },
  ],
};

const parse = (value: unknown) => onboardingInputSchema.safeParse(value);

describe("onboardingInputSchema", () => {
  it("accepts a complete answer and trims wallet names", () => {
    const result = parse(valid);
    expect(result.success).toBe(true);
    expect(result.data?.wallets[1]?.name).toBe("Tirelire");
  });

  it.each<[string, unknown]>([
    ["an unknown locale", { ...valid, locale: "de" }],
    ["a monthly amount of 0", { ...valid, monthlyMillimes: 0 }],
    ["a monthly amount in dinars with decimals", { ...valid, monthlyMillimes: 600.5 }],
    ["a monthly amount sent as text", { ...valid, monthlyMillimes: "600000" }],
    ["arrival day 0", { ...valid, arrivalDay: 0 }],
    ["arrival day 32", { ...valid, arrivalDay: 32 }],
    [
      "an unknown fixed cost",
      { ...valid, fixedCosts: [{ key: "gym", amountMillimes: 1, alreadyPaid: false }] },
    ],
    [
      "the same fixed cost twice",
      {
        ...valid,
        fixedCosts: [
          { key: "rent", amountMillimes: 1, alreadyPaid: false },
          { key: "rent", amountMillimes: 2, alreadyPaid: true },
        ],
      },
    ],
    ["no wallets", { ...valid, wallets: [] }],
    ["a negative balance", { ...valid, wallets: [{ kind: "cash", balanceMillimes: -1 }] }],
    ["an unknown wallet type", { ...valid, wallets: [{ kind: "paypal", balanceMillimes: 0 }] }],
    [
      "an 'other' wallet without a name",
      { ...valid, wallets: [{ kind: "other", balanceMillimes: 0 }] },
    ],
    [
      "an 'other' wallet with a blank name",
      { ...valid, wallets: [{ kind: "other", name: "  ", balanceMillimes: 0 }] },
    ],
    [
      "the same wallet type twice",
      {
        ...valid,
        wallets: [
          { kind: "d17", balanceMillimes: 0 },
          { kind: "d17", balanceMillimes: 0 },
        ],
      },
    ],
    ["extra fields (like a user id)", { ...valid, userId: "someone-else" }],
  ])("rejects %s", (_, value) => {
    expect(parse(value).success).toBe(false);
  });
});
