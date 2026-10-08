import { type OnboardingAnswers, planOnboarding } from "@mizania/core";
import { asc, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { categories, cycles, planItems, transactions, users, wallets } from "../schema";
import { seedDefaultCategories } from "../seed/seed-default-categories";
import { createTestDatabase, type TestDatabase } from "../test/test-database";
import { saveOnboarding } from "./save-onboarding";

let test: TestDatabase;
let n = 0;
const now = new Date("2026-10-08T10:00:00Z");

beforeAll(async () => {
  test = await createTestDatabase();
  await seedDefaultCategories(test.db);
});
afterAll(async () => {
  await test.close();
});

async function newUser() {
  const [user] = await test.db
    .insert(users)
    .values({ name: "Amel", email: `onboard${++n}@example.com` })
    .returning();
  if (!user) throw new Error("no user");
  return user.id;
}

const answers: OnboardingAnswers = {
  locale: "fr",
  monthlyMillimes: 600_000,
  arrivalDay: 1,
  fixedCosts: [
    { key: "rent", amountMillimes: 250_000, alreadyPaid: true },
    { key: "internet", amountMillimes: 35_000, alreadyPaid: false },
  ],
  wallets: [
    { kind: "cash", balanceMillimes: 45_500 },
    { kind: "d17", balanceMillimes: 0 },
    { kind: "other", name: "Tirelire", balanceMillimes: 20_000 },
  ],
};
const plan = planOnboarding(answers, "2026-10-08");

const rowsOf = async (userId: string) => {
  const userWallets = await test.db
    .select()
    .from(wallets)
    .where(eq(wallets.userId, userId))
    .orderBy(asc(wallets.position));
  const userCycles = await test.db.select().from(cycles).where(eq(cycles.userId, userId));
  const userTransactions = await test.db
    .select()
    .from(transactions)
    .where(eq(transactions.userId, userId));
  const items = userCycles.length
    ? await test.db
        .select({ item: planItems, key: categories.key })
        .from(planItems)
        .innerJoin(categories, eq(categories.id, planItems.categoryId))
        .where(
          inArray(
            planItems.cycleId,
            userCycles.map((c) => c.id),
          ),
        )
    : [];
  const [user] = await test.db.select().from(users).where(eq(users.id, userId));
  return { user, wallets: userWallets, cycles: userCycles, transactions: userTransactions, items };
};

describe("saveOnboarding", () => {
  it("saves the answers, wallets, starting balances, first cycle and fixed costs", async () => {
    const userId = await newUser();

    expect(await saveOnboarding(test.db, userId, plan, now)).toBe("saved");

    const rows = await rowsOf(userId);
    expect(rows.user).toMatchObject({
      locale: "fr",
      usualMonthlyMillimes: 600_000,
      usualArrivalDay: 1,
      onboardedAt: now,
    });
    expect(rows.wallets.map((w) => [w.type, w.name, w.position])).toEqual([
      ["cash", null, 0],
      ["d17", null, 1],
      ["other", "Tirelire", 2],
    ]);
    expect(rows.cycles).toHaveLength(1);
    expect(rows.cycles[0]).toMatchObject({
      startedOn: "2026-10-08",
      expectedNextOn: "2026-11-01",
      status: "active",
      weeklyMode: true,
    });
    const cycleId = rows.cycles[0]?.id;

    // Balances are derived: one adjustment per non-empty wallet, none for D17 at 0.
    const balances = rows.transactions.map((t) => ({
      wallet: rows.wallets.find((w) => w.id === t.walletId)?.type,
      type: t.type,
      source: t.source,
      amount: t.amountMillimes,
      cycleId: t.cycleId,
    }));
    expect(balances).toEqual(
      expect.arrayContaining([
        { wallet: "cash", type: "adjustment", source: "manual", amount: 45_500, cycleId },
        { wallet: "other", type: "adjustment", source: "manual", amount: 20_000, cycleId },
      ]),
    );
    expect(balances).toHaveLength(2);

    expect(
      rows.items
        .map((r) => ({
          key: r.key,
          kind: r.item.kind,
          amount: r.item.amountMillimes,
          paid: r.item.paidAt,
        }))
        .sort((a, b) => a.key.localeCompare(b.key)),
    ).toEqual([
      { key: "internet", kind: "fixed", amount: 35_000, paid: null },
      { key: "rent", kind: "fixed", amount: 250_000, paid: now },
    ]);
  });

  it("is safe to retry: a second call changes nothing and duplicates nothing", async () => {
    const userId = await newUser();
    await saveOnboarding(test.db, userId, plan, now);
    const before = await rowsOf(userId);

    const other = planOnboarding({ ...answers, monthlyMillimes: 999_000 }, "2026-10-09");
    expect(await saveOnboarding(test.db, userId, other, new Date())).toBe("already-onboarded");

    expect(await rowsOf(userId)).toEqual(before);
  });

  it("saves once when two requests arrive at the same time", async () => {
    const userId = await newUser();

    const results = await Promise.all([
      saveOnboarding(test.db, userId, plan, now),
      saveOnboarding(test.db, userId, plan, now),
    ]);

    expect(results.sort()).toEqual(["already-onboarded", "saved"]);
    const rows = await rowsOf(userId);
    expect(rows.wallets).toHaveLength(3);
    expect(rows.cycles).toHaveLength(1);
    expect(rows.transactions).toHaveLength(2);
  });

  it("only touches the given user: another user's data stays as it was", async () => {
    const amel = await newUser();
    const sami = await newUser();
    await saveOnboarding(test.db, amel, plan, now);
    const amelBefore = await rowsOf(amel);

    await saveOnboarding(
      test.db,
      sami,
      planOnboarding(
        { ...answers, wallets: [{ kind: "card", balanceMillimes: 1_000 }] },
        "2026-10-08",
      ),
      now,
    );

    expect(await rowsOf(amel)).toEqual(amelBefore);
    const samiRows = await rowsOf(sami);
    expect(samiRows.wallets.map((w) => w.type)).toEqual(["card"]);
    expect(samiRows.transactions.every((t) => t.userId === sami)).toBe(true);
  });

  it("saves nothing at all if any part fails", async () => {
    const userId = await newUser();
    // A plan that references a category that doesn't exist fails on the last step.
    const broken = {
      ...plan,
      fixedCosts: [{ categoryKey: "missing" as "rent", amountMillimes: 1_000, paid: false }],
    };

    await expect(saveOnboarding(test.db, userId, broken, now)).rejects.toThrow(/missing/);

    const rows = await rowsOf(userId);
    expect(rows.user?.onboardedAt).toBeNull();
    expect(rows.wallets).toHaveLength(0);
    expect(rows.cycles).toHaveLength(0);
    expect(rows.transactions).toHaveLength(0);
  });

  it("works without fixed costs or non-empty wallets", async () => {
    const userId = await newUser();
    const minimal = planOnboarding(
      { ...answers, fixedCosts: [], wallets: [{ kind: "cash", balanceMillimes: 0 }] },
      "2026-10-08",
    );

    expect(await saveOnboarding(test.db, userId, minimal, now)).toBe("saved");
    const rows = await rowsOf(userId);
    expect(rows.wallets).toHaveLength(1);
    expect(rows.transactions).toHaveLength(0);
    expect(rows.items).toHaveLength(0);
  });

  it("refuses an unknown user", async () => {
    await expect(saveOnboarding(test.db, crypto.randomUUID(), plan, now)).rejects.toThrow(
      /user not found/,
    );
  });
});
