import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  type OnboardingAnswers,
  onboardingFixedCosts,
  planOnboarding,
  WALLET_NAME_MAX_LENGTH,
  walletKinds,
} from "./onboarding";

const answers: OnboardingAnswers = {
  locale: "fr",
  monthlyMillimes: 600_000,
  arrivalDay: 1,
  fixedCosts: [
    { key: "rent", amountMillimes: 250_000, alreadyPaid: true },
    { key: "electricity", amountMillimes: 30_000, alreadyPaid: false },
  ],
  wallets: [
    { kind: "cash", balanceMillimes: 45_500 },
    { kind: "d17", balanceMillimes: 0 },
    { kind: "other", name: "  Tirelire  ", balanceMillimes: 20_000 },
  ],
};

describe("planOnboarding", () => {
  it("plans the first cycle from the answers", () => {
    expect(planOnboarding(answers, "2026-10-08")).toEqual({
      user: { locale: "fr", usualMonthlyMillimes: 600_000, usualArrivalDay: 1 },
      cycle: { startedOn: "2026-10-08", expectedNextOn: "2026-11-01" },
      wallets: [
        { kind: "cash", name: null, position: 0 },
        { kind: "d17", name: null, position: 1 },
        { kind: "other", name: "Tirelire", position: 2 },
      ],
      startingBalances: [
        { walletIndex: 0, amountMillimes: 45_500 },
        { walletIndex: 2, amountMillimes: 20_000 },
      ],
      fixedCosts: [
        { categoryKey: "rent", kind: "fixed", amountMillimes: 250_000, paid: true },
        { categoryKey: "electricity", kind: "fixed", amountMillimes: 30_000, paid: false },
      ],
    });
  });

  it("stores no name for cash, D17, Flouci or card wallets, even if one is sent", () => {
    const plan = planOnboarding(
      { ...answers, wallets: [{ kind: "card", name: "My card", balanceMillimes: 0 }] },
      "2026-10-08",
    );
    expect(plan.wallets).toEqual([{ kind: "card", name: null, position: 0 }]);
    expect(plan.startingBalances).toEqual([]);
  });

  it("plans phone recharge as an envelope, never already paid", () => {
    const plan = planOnboarding(
      {
        ...answers,
        fixedCosts: [{ key: "phone_recharge", amountMillimes: 20_000, alreadyPaid: true }],
      },
      "2026-10-08",
    );
    expect(plan.fixedCosts).toEqual([
      { categoryKey: "phone_recharge", kind: "envelope", amountMillimes: 20_000, paid: false },
    ]);
  });

  it("accepts no fixed costs (no rent, no bills)", () => {
    expect(planOnboarding({ ...answers, fixedCosts: [] }, "2026-10-08").fixedCosts).toEqual([]);
  });

  const invalid: [string, Partial<OnboardingAnswers>][] = [
    ["monthly amount 0", { monthlyMillimes: 0 }],
    ["monthly amount not whole millimes", { monthlyMillimes: 1.5 }],
    ["arrival day 32", { arrivalDay: 32 }],
    ["no wallets", { wallets: [] }],
    ["negative balance", { wallets: [{ kind: "cash", balanceMillimes: -1 }] }],
    ["balance not whole millimes", { wallets: [{ kind: "cash", balanceMillimes: 0.5 }] }],
    [
      "the same wallet type twice",
      {
        wallets: [
          { kind: "cash", balanceMillimes: 0 },
          { kind: "cash", balanceMillimes: 0 },
        ],
      },
    ],
    ["an 'other' wallet without a name", { wallets: [{ kind: "other", balanceMillimes: 0 }] }],
    [
      "an 'other' wallet with a blank name",
      { wallets: [{ kind: "other", name: "   ", balanceMillimes: 0 }] },
    ],
    [
      "a name that is too long",
      {
        wallets: [
          { kind: "other", name: "x".repeat(WALLET_NAME_MAX_LENGTH + 1), balanceMillimes: 0 },
        ],
      },
    ],
    ["a fixed cost of 0", { fixedCosts: [{ key: "rent", amountMillimes: 0, alreadyPaid: false }] }],
    [
      "the same fixed cost twice",
      {
        fixedCosts: [
          { key: "rent", amountMillimes: 1000, alreadyPaid: false },
          { key: "rent", amountMillimes: 2000, alreadyPaid: false },
        ],
      },
    ],
  ];

  it.each(invalid)("rejects %s", (_, change) => {
    expect(() => planOnboarding({ ...answers, ...change }, "2026-10-08")).toThrow(RangeError);
  });

  it("rejects an invalid today", () => {
    expect(() => planOnboarding(answers, "2026-13-01")).toThrow(RangeError);
  });

  it("allows several 'other' wallets", () => {
    const plan = planOnboarding(
      {
        ...answers,
        wallets: [
          { kind: "other", name: "A", balanceMillimes: 0 },
          { kind: "other", name: "B", balanceMillimes: 0 },
        ],
      },
      "2026-10-08",
    );
    expect(plan.wallets.map((w) => w.name)).toEqual(["A", "B"]);
  });

  // Property: no money appears or disappears between the answers and the plan.
  const wallet = fc.record({
    kind: fc.constantFrom(...walletKinds.filter((k) => k !== "other")),
    balanceMillimes: fc.integer({ min: 0, max: 10_000_000 }),
  });
  const walletsArb = fc.uniqueArray(wallet, { selector: (w) => w.kind, minLength: 1 });
  const costsArb = fc.uniqueArray(
    fc.record({
      key: fc.constantFrom(...onboardingFixedCosts),
      amountMillimes: fc.integer({ min: 1, max: 5_000_000 }),
      alreadyPaid: fc.boolean(),
    }),
    { selector: (c) => c.key },
  );

  it("starting balances add up to the wallets' total, one per non-empty wallet", () => {
    fc.assert(
      fc.property(walletsArb, costsArb, (wallets, fixedCosts) => {
        const plan = planOnboarding({ ...answers, wallets, fixedCosts }, "2026-10-08");
        const total = wallets.reduce((sum, w) => sum + w.balanceMillimes, 0);
        const planned = plan.startingBalances.reduce((sum, b) => sum + b.amountMillimes, 0);

        expect(planned).toBe(total);
        expect(plan.startingBalances).toHaveLength(
          wallets.filter((w) => w.balanceMillimes > 0).length,
        );
        for (const b of plan.startingBalances) {
          expect(b.amountMillimes).toBeGreaterThan(0);
          expect(wallets[b.walletIndex]?.balanceMillimes).toBe(b.amountMillimes);
        }
        expect(plan.fixedCosts.map((c) => c.amountMillimes)).toEqual(
          fixedCosts.map((c) => c.amountMillimes),
        );
        for (const cost of plan.fixedCosts) {
          expect(cost.kind).toBe(cost.categoryKey === "phone_recharge" ? "envelope" : "fixed");
          if (cost.kind === "envelope") expect(cost.paid).toBe(false);
        }
      }),
    );
  });
});
