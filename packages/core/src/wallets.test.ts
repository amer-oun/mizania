import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  archiveSettlement,
  type BalanceTransaction,
  previewTransfer,
  totalBalance,
  walletBalances,
} from "./wallets";

const ids = ["cash", "card", "d17"];
// Two different wallets, in either order.
const pairs = fc.constantFrom<[string, string]>(
  ["cash", "card"],
  ["card", "cash"],
  ["cash", "d17"],
  ["d17", "cash"],
  ["card", "d17"],
  ["d17", "card"],
);

describe("walletBalances", () => {
  it("adds adjustments and income, takes off expenses, and moves transfers", () => {
    const balances = walletBalances(ids, [
      { type: "adjustment", walletId: "card", amountMillimes: 120_000 },
      { type: "adjustment", walletId: "cash", amountMillimes: 10_000 },
      { type: "transfer", walletId: "card", toWalletId: "cash", amountMillimes: 50_000 },
      { type: "expense", walletId: "cash", amountMillimes: 3_500 },
      { type: "income", walletId: "d17", amountMillimes: 600_000 },
      { type: "adjustment", walletId: "d17", amountMillimes: -1_000 },
    ]);
    expect(Object.fromEntries(balances)).toEqual({
      card: 70_000,
      cash: 56_500,
      d17: 599_000,
    });
  });

  it("puts wallets without transactions at 0", () => {
    expect(Object.fromEntries(walletBalances(ids, []))).toEqual({ cash: 0, card: 0, d17: 0 });
  });

  it("lets a balance go below 0 (spending more than was recorded)", () => {
    const balances = walletBalances(ids, [
      { type: "expense", walletId: "cash", amountMillimes: 2_000 },
    ]);
    expect(balances.get("cash")).toBe(-2_000);
  });

  it.each<[string, BalanceTransaction]>([
    ["an unknown wallet", { type: "expense", walletId: "x", amountMillimes: 1 }],
    [
      "an unknown target",
      { type: "transfer", walletId: "cash", toWalletId: "x", amountMillimes: 1 },
    ],
    ["a transfer without a target", { type: "transfer", walletId: "cash", amountMillimes: 1 }],
    [
      "a transfer to the same wallet",
      { type: "transfer", walletId: "cash", toWalletId: "cash", amountMillimes: 1 },
    ],
    [
      "a target on a non-transfer",
      { type: "expense", walletId: "cash", toWalletId: "card", amountMillimes: 1 },
    ],
    ["an amount of 0", { type: "income", walletId: "cash", amountMillimes: 0 }],
    ["a negative expense", { type: "expense", walletId: "cash", amountMillimes: -5 }],
    ["an adjustment of 0", { type: "adjustment", walletId: "cash", amountMillimes: 0 }],
    ["a fractional amount", { type: "income", walletId: "cash", amountMillimes: 1.5 }],
  ])("refuses %s", (_, transaction) => {
    expect(() => walletBalances(ids, [transaction])).toThrow(RangeError);
  });

  it("refuses a balance too large to hold exactly", () => {
    const big = {
      type: "income" as const,
      walletId: "cash",
      amountMillimes: Number.MAX_SAFE_INTEGER,
    };
    expect(() => walletBalances(ids, [big, big])).toThrow(RangeError);
  });

  // Random transactions between the three wallets.
  const amount = fc.integer({ min: 1, max: 10_000_000 });
  const walletId = fc.constantFrom(...ids);
  const transaction: fc.Arbitrary<BalanceTransaction> = fc.oneof(
    fc.record({ type: fc.constant("income" as const), walletId, amountMillimes: amount }),
    fc.record({ type: fc.constant("expense" as const), walletId, amountMillimes: amount }),
    fc.record({
      type: fc.constant("adjustment" as const),
      walletId,
      amountMillimes: fc.oneof(
        amount,
        amount.map((a) => -a),
      ),
    }),
    fc.tuple(pairs, amount).map(([[from, to], amountMillimes]) => ({
      type: "transfer" as const,
      walletId: from,
      toWalletId: to,
      amountMillimes,
    })),
  );
  const history = fc.array(transaction, { maxLength: 40 });

  it("a transfer keeps the total", () => {
    fc.assert(
      fc.property(history, pairs, amount, (h, [from, to], a) => {
        const before = totalBalance(walletBalances(ids, h).values());
        const after = totalBalance(
          walletBalances(ids, [
            ...h,
            {
              type: "transfer",
              walletId: from,
              toWalletId: to,
              amountMillimes: a,
            },
          ]).values(),
        );
        expect(after).toBe(before);
      }),
    );
  });

  it("each balance is starting balance + money in − money out", () => {
    fc.assert(
      fc.property(history, (h) => {
        const balances = walletBalances(ids, h);
        for (const id of ids) {
          let expected = 0;
          for (const t of h) {
            if (t.walletId === id) {
              expected +=
                t.type === "expense" || t.type === "transfer"
                  ? -t.amountMillimes
                  : t.amountMillimes;
            }
            if (t.toWalletId === id) expected += t.amountMillimes;
          }
          expect(balances.get(id)).toBe(expected);
        }
      }),
    );
  });

  it("doesn't depend on the order of transactions", () => {
    fc.assert(
      fc.property(history, fc.nat(), (h, seed) => {
        const reversed = [...h].reverse();
        const rotated = h.length
          ? [...h.slice(seed % h.length), ...h.slice(0, seed % h.length)]
          : h;
        const balances = Object.fromEntries(walletBalances(ids, h));
        expect(Object.fromEntries(walletBalances(ids, reversed))).toEqual(balances);
        expect(Object.fromEntries(walletBalances(ids, rotated))).toEqual(balances);
      }),
    );
  });
});

describe("totalBalance", () => {
  it("adds the balances", () => {
    expect(totalBalance([70_000, -2_000, 0])).toBe(68_000);
    expect(totalBalance([])).toBe(0);
  });

  it("refuses invalid or overflowing amounts", () => {
    expect(() => totalBalance([1.5])).toThrow(RangeError);
    expect(() => totalBalance([Number.MAX_SAFE_INTEGER, 1])).toThrow(RangeError);
  });
});

describe("previewTransfer", () => {
  it("takes the amount from one wallet and adds it to the other", () => {
    expect(previewTransfer(120_000, 10_000, 50_000)).toEqual({ from: 70_000, to: 60_000 });
    expect(previewTransfer(0, 0, 5_000)).toEqual({ from: -5_000, to: 5_000 });
  });

  it("refuses an amount of 0 or less, decimals, or overflow", () => {
    expect(() => previewTransfer(1, 1, 0)).toThrow(RangeError);
    expect(() => previewTransfer(1, 1, -1)).toThrow(RangeError);
    expect(() => previewTransfer(1, 1.5, 1)).toThrow(RangeError);
    expect(() => previewTransfer(1, Number.MAX_SAFE_INTEGER, 1)).toThrow(RangeError);
    expect(() => previewTransfer(-Number.MAX_SAFE_INTEGER, 0, 1)).toThrow(RangeError);
  });

  it("matches walletBalances after the same transfer", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -1e9, max: 1e9 }),
        fc.integer({ min: -1e9, max: 1e9 }),
        fc.integer({ min: 1, max: 1e9 }),
        (fromBalance, toBalance, amount) => {
          const start = [
            { walletId: "card", amountMillimes: fromBalance },
            { walletId: "cash", amountMillimes: toBalance },
          ]
            .filter((t) => t.amountMillimes !== 0)
            .map((t) => ({ ...t, type: "adjustment" as const }));
          const after = walletBalances(ids, [
            ...start,
            { type: "transfer", walletId: "card", toWalletId: "cash", amountMillimes: amount },
          ]);
          expect(previewTransfer(fromBalance, toBalance, amount)).toEqual({
            from: after.get("card"),
            to: after.get("cash"),
          });
        },
      ),
    );
  });
});

describe("archiveSettlement", () => {
  it("needs nothing when the wallet is already at 0", () => {
    expect(archiveSettlement("cash", 0, { kind: "zero" })).toBeNull();
    expect(archiveSettlement("cash", 0, { kind: "move", toWalletId: "card" })).toBeNull();
  });

  it("moves a positive balance out, or a negative one in", () => {
    expect(archiveSettlement("d17", 35_000, { kind: "move", toWalletId: "cash" })).toEqual({
      type: "transfer",
      walletId: "d17",
      toWalletId: "cash",
      amountMillimes: 35_000,
    });
    expect(archiveSettlement("d17", -4_000, { kind: "move", toWalletId: "cash" })).toEqual({
      type: "transfer",
      walletId: "cash",
      toWalletId: "d17",
      amountMillimes: 4_000,
    });
  });

  it("zeroes the balance with an adjustment", () => {
    expect(archiveSettlement("d17", 35_000, { kind: "zero" })).toEqual({
      type: "adjustment",
      walletId: "d17",
      amountMillimes: -35_000,
    });
    expect(archiveSettlement("d17", -4_000, { kind: "zero" })).toEqual({
      type: "adjustment",
      walletId: "d17",
      amountMillimes: 4_000,
    });
  });

  it("refuses to move money to the same wallet, or an invalid balance", () => {
    expect(() => archiveSettlement("d17", 1, { kind: "move", toWalletId: "d17" })).toThrow(
      RangeError,
    );
    expect(() => archiveSettlement("d17", 0.5, { kind: "zero" })).toThrow(RangeError);
  });

  it("always leaves the archived wallet at 0 and keeps the total of the others otherwise", () => {
    fc.assert(
      fc.property(fc.integer({ min: -1e9, max: 1e9 }), fc.boolean(), (balance, move) => {
        const before = [
          { type: "adjustment" as const, walletId: "card", amountMillimes: 100_000 },
          ...(balance === 0
            ? []
            : [{ type: "adjustment" as const, walletId: "d17", amountMillimes: balance }]),
        ];
        const choice = move
          ? { kind: "move" as const, toWalletId: "card" }
          : { kind: "zero" as const };
        const settlement = archiveSettlement("d17", balance, choice);
        const after = walletBalances(ids, settlement ? [...before, settlement] : before);
        expect(after.get("d17")).toBe(0);
        if (move) {
          expect(totalBalance(after.values())).toBe(
            totalBalance(walletBalances(ids, before).values()),
          );
        }
      }),
    );
  });
});
