import { randomUUID } from "node:crypto";

import { planOnboarding } from "@mizania/core";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getBudget } from "../budget/budget";
import { saveOnboarding } from "../onboarding/save-onboarding";
import { cycles, planItems, transactions, users, wallets } from "../schema";
import { seedDefaultCategories } from "../seed/seed-default-categories";
import { createTestDatabase, type TestDatabase } from "../test/test-database";
import { archiveWallet } from "../wallets/wallets";
import { getPlan, markFixedCostPaid, payFixedCost, undoFixedCostPayment } from "./fixed-costs";

let test: TestDatabase;
let n = 0;
const today = "2026-10-11";
const now = new Date("2026-10-11T10:00:00Z");

beforeAll(async () => {
  test = await createTestDatabase();
  await seedDefaultCategories(test.db);
});
afterAll(async () => {
  await test.close();
});

/**
 * Onboarded on Oct 11, money expected on the 31st (20 days), normal mode:
 * cash 300 and D17 50; rent 100 and STEG 30 to pay, internet already paid,
 * and a 20 DT phone recharge envelope. Daily money: 350 − 150 = 200.
 */
async function student() {
  const [user] = await test.db
    .insert(users)
    .values({ name: "Amel", email: `plan${++n}@example.com`, weeklyMode: false })
    .returning();
  if (!user) throw new Error("no user");
  await saveOnboarding(
    test.db,
    user.id,
    planOnboarding(
      {
        locale: "fr",
        monthlyMillimes: 600_000,
        arrivalDay: 31,
        fixedCosts: [
          { key: "rent", amountMillimes: 100_000, alreadyPaid: false },
          { key: "electricity", amountMillimes: 30_000, alreadyPaid: false },
          { key: "internet", amountMillimes: 35_000, alreadyPaid: true },
          { key: "phone_recharge", amountMillimes: 20_000, alreadyPaid: false },
        ],
        wallets: [
          { kind: "cash", balanceMillimes: 300_000 },
          { kind: "d17", balanceMillimes: 50_000 },
        ],
      },
      today,
    ),
    new Date("2026-10-11T08:00:00Z"),
  );
  const own = await test.db.select().from(wallets).where(eq(wallets.userId, user.id));
  const plan = await getPlan(test.db, user.id, today);
  const costId = (key: string) => plan?.fixedCosts.find((c) => c.categoryKey === key)?.id ?? "";
  return {
    userId: user.id,
    cash: own.find((w) => w.type === "cash")?.id ?? "",
    d17: own.find((w) => w.type === "d17")?.id ?? "",
    rent: costId("rent"),
    steg: costId("electricity"),
    internet: costId("internet"),
  };
}

const payment = (planItemId: string, walletId: string, amountMillimes: number, final = true) => ({
  id: randomUUID(),
  planItemId,
  walletId,
  amountMillimes,
  final,
});
const budget = async (userId: string) => (await getBudget(test.db, userId, today))?.today;

describe("getPlan", () => {
  it("lists the fixed costs and envelopes with what's paid and left", async () => {
    const { userId } = await student();
    const plan = await getPlan(test.db, userId, today);

    expect(plan?.cycle).toEqual({ startedOn: today, expectedNextOn: "2026-10-31" });
    expect(
      plan?.fixedCosts.map((c) => [c.categoryKey, c.planned, c.paidSoFar, c.left, c.paid]),
    ).toEqual([
      ["rent", 100_000, 0, 100_000, false],
      ["electricity", 30_000, 0, 30_000, false],
      ["internet", 35_000, 0, 0, true],
    ]);
    expect(plan?.fixedCosts[0]?.names?.fr).toBe("Loyer");
    expect(plan?.envelopes).toMatchObject([
      { categoryKey: "phone_recharge", planned: 20_000, spent: 0, left: 20_000 },
    ]);
    expect(plan?.stillToPay).toBe(130_000);
    expect(await budget(userId)).toMatchObject({ allowance: 10_000 });
  });

  it("returns null without an active cycle", async () => {
    const [user] = await test.db
      .insert(users)
      .values({ name: "New", email: `plan${++n}@example.com` })
      .returning();
    expect(await getPlan(test.db, user?.id ?? "", today)).toBeNull();
  });
});

describe("payFixedCost", () => {
  it("at the planned amount: paid, and today's amount doesn't move", async () => {
    const { userId, cash, steg } = await student();
    const input = payment(steg, cash, 30_000);
    expect(await payFixedCost(test.db, userId, input, now)).toBe("saved");

    const [row] = await test.db.select().from(transactions).where(eq(transactions.id, input.id));
    expect(row).toMatchObject({
      type: "expense",
      source: "plan",
      planItemId: steg,
      walletId: cash,
      amountMillimes: 30_000,
      occurredAt: now,
    });
    const plan = await getPlan(test.db, userId, today);
    expect(plan?.fixedCosts.find((c) => c.id === steg)).toMatchObject({
      paidSoFar: 30_000,
      left: 0,
      paid: true,
      paidAt: now,
      lastWalletId: cash,
    });
    expect(plan?.stillToPay).toBe(100_000);
    expect(await budget(userId)).toMatchObject({ allowance: 10_000, left: 10_000 });
  });

  it("higher than planned: the difference is spent from today's money", async () => {
    const { userId, cash, steg } = await student();
    await payFixedCost(test.db, userId, payment(steg, cash, 36_000), now);
    expect(await budget(userId)).toMatchObject({ allowance: 10_000, left: 4_000 });
    const expenses = (await getBudget(test.db, userId, today))?.todayExpenses;
    expect(expenses?.[0]).toMatchObject({ source: "plan", dailyPart: 6_000 });
  });

  it("lower than planned and final: the rest goes back into the daily money", async () => {
    const { userId, cash, steg } = await student();
    await payFixedCost(test.db, userId, payment(steg, cash, 25_000), now);
    // 205 DT over 20 days.
    expect(await budget(userId)).toMatchObject({ allowance: 10_250, left: 10_250 });
  });

  it("in parts: only what's left stays set aside, until marked paid", async () => {
    const { userId, cash, d17, rent } = await student();
    await payFixedCost(test.db, userId, payment(rent, cash, 50_000, false), now);
    await payFixedCost(test.db, userId, payment(rent, d17, 30_000, false), now);

    let rentNow = (await getPlan(test.db, userId, today))?.fixedCosts.find((c) => c.id === rent);
    expect(rentNow).toMatchObject({ paidSoFar: 80_000, left: 20_000, paid: false });
    expect(await budget(userId)).toMatchObject({ allowance: 10_000 });

    // The landlord agreed to 80: "that's everything for this month".
    expect(await markFixedCostPaid(test.db, userId, rent, now)).toBe("done");
    rentNow = (await getPlan(test.db, userId, today))?.fixedCosts.find((c) => c.id === rent);
    expect(rentNow).toMatchObject({ paidSoFar: 80_000, left: 0, paid: true });
    expect(await budget(userId)).toMatchObject({ allowance: 11_000 }); // 220 / 20
  });

  it("saves a retried payment once, and refuses a cost already paid", async () => {
    const { userId, cash, steg, internet } = await student();
    const input = payment(steg, cash, 30_000);
    const results = await Promise.all([
      payFixedCost(test.db, userId, input),
      payFixedCost(test.db, userId, input),
      payFixedCost(test.db, userId, input),
    ]);
    expect(results).toEqual(["saved", "saved", "saved"]);
    expect(await test.db.$count(transactions, eq(transactions.planItemId, steg))).toBe(1);

    expect(await payFixedCost(test.db, userId, payment(steg, cash, 1_000))).toBe("already-paid");
    expect(await payFixedCost(test.db, userId, payment(internet, cash, 1_000))).toBe(
      "already-paid",
    );
  });

  it("refuses an archived wallet, an envelope and an unknown plan item", async () => {
    const { userId, cash, d17, rent } = await student();
    await archiveWallet(test.db, userId, d17, { kind: "move", toWalletId: cash });
    expect(await payFixedCost(test.db, userId, payment(rent, d17, 1_000))).toBe("not-found");
    const [envelope] = await test.db
      .select()
      .from(planItems)
      .where(eq(planItems.kind, "envelope"))
      .limit(1);
    expect(await payFixedCost(test.db, userId, payment(envelope?.id ?? "", cash, 1_000))).toBe(
      "not-found",
    );
    expect(await payFixedCost(test.db, userId, payment(randomUUID(), cash, 1_000))).toBe(
      "not-found",
    );
  });

  it("refuses a fixed cost of a closed cycle", async () => {
    const { userId, cash, rent } = await student();
    await test.db
      .update(cycles)
      .set({ status: "closed" })
      .where(and(eq(cycles.userId, userId), eq(cycles.status, "active")));
    expect(await payFixedCost(test.db, userId, payment(rent, cash, 1_000))).toBe("not-found");
  });
});

describe("undoFixedCostPayment", () => {
  it("undoes the latest payment and marks the cost unpaid", async () => {
    const { userId, cash, rent } = await student();
    const first = payment(rent, cash, 50_000, false);
    const last = payment(rent, cash, 50_000, true);
    await payFixedCost(test.db, userId, first, new Date("2026-10-11T09:00:00Z"));
    await payFixedCost(test.db, userId, last, now);

    expect(await undoFixedCostPayment(test.db, userId, rent, now)).toBe("done");
    const [undone] = await test.db.select().from(transactions).where(eq(transactions.id, last.id));
    expect(undone?.deletedAt).toEqual(now);
    const rentNow = (await getPlan(test.db, userId, today))?.fixedCosts.find((c) => c.id === rent);
    expect(rentNow).toMatchObject({ paidSoFar: 50_000, left: 50_000, paid: false });
    expect(await budget(userId)).toMatchObject({ allowance: 10_000, left: 10_000 });
  });

  it("after 'mark paid', only unmarks it: the payments stay", async () => {
    const { userId, cash, rent } = await student();
    await payFixedCost(test.db, userId, payment(rent, cash, 80_000, false), now);
    await markFixedCostPaid(test.db, userId, rent, new Date("2026-10-11T11:00:00Z"));

    expect(await undoFixedCostPayment(test.db, userId, rent, now)).toBe("done");
    let rentNow = (await getPlan(test.db, userId, today))?.fixedCosts.find((c) => c.id === rent);
    expect(rentNow).toMatchObject({ paidSoFar: 80_000, left: 20_000, paid: false });

    // Undoing again removes the partial payment.
    expect(await undoFixedCostPayment(test.db, userId, rent, now)).toBe("done");
    rentNow = (await getPlan(test.db, userId, today))?.fixedCosts.find((c) => c.id === rent);
    expect(rentNow).toMatchObject({ paidSoFar: 0, left: 100_000, paid: false });
  });

  it("marks an onboarding 'already paid' cost unpaid, with no payment to undo", async () => {
    const { userId, internet } = await student();
    expect(await undoFixedCostPayment(test.db, userId, internet)).toBe("done");
    expect((await getPlan(test.db, userId, today))?.stillToPay).toBe(165_000);
  });

  it("is refused when the payment's wallet is archived", async () => {
    const { userId, cash, d17, rent } = await student();
    await payFixedCost(test.db, userId, payment(rent, d17, 40_000), now);
    await archiveWallet(test.db, userId, d17, { kind: "move", toWalletId: cash });
    expect(await undoFixedCostPayment(test.db, userId, rent)).toBe("wallet-archived");
  });
});

// Required (CLAUDE.md): one student can't see, pay or undo another's plan.
describe("isolation between users", () => {
  it("B can't pay, mark or undo A's fixed costs, or pay from A's wallet", async () => {
    const a = await student();
    const b = await student();
    await payFixedCost(test.db, a.userId, payment(a.steg, a.cash, 30_000), now);
    const snapshot = async () => ({
      items: await test.db.select().from(planItems).orderBy(planItems.id),
      payments: await test.db.select().from(transactions).where(eq(transactions.userId, a.userId)),
    });
    const before = await snapshot();

    expect(await payFixedCost(test.db, b.userId, payment(a.rent, b.cash, 1_000))).toBe("not-found");
    expect(await payFixedCost(test.db, b.userId, payment(b.rent, a.cash, 1_000))).toBe("not-found");
    expect(await markFixedCostPaid(test.db, b.userId, a.rent)).toBe("not-found");
    expect(await undoFixedCostPayment(test.db, b.userId, a.steg)).toBe("not-found");

    expect(await snapshot()).toEqual(before);
  });

  it("B's plan never shows A's costs or payments, and A's payment ID can't be reused", async () => {
    const a = await student();
    const b = await student();
    const input = payment(a.rent, a.cash, 100_000);
    await payFixedCost(test.db, a.userId, input, now);

    expect(
      await payFixedCost(test.db, b.userId, { ...payment(b.rent, b.cash, 100_000), id: input.id }),
    ).toBe("not-found");
    const plan = await getPlan(test.db, b.userId, today);
    expect(plan?.fixedCosts.map((c) => c.id)).toEqual([b.rent, b.steg, b.internet]);
    expect(plan?.fixedCosts.every((c) => c.paidSoFar === 0 && c.lastWalletId === null)).toBe(true);
    expect(plan?.stillToPay).toBe(130_000);
  });
});
