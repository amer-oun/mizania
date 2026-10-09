import { randomUUID } from "node:crypto";

import { planOnboarding } from "@mizania/core";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getBudget } from "../budget/budget";
import { saveOnboarding } from "../onboarding/save-onboarding";
import { categories, cycles, planItems, transactions, users, wallets } from "../schema";
import { seedDefaultCategories } from "../seed/seed-default-categories";
import { createTestDatabase, type TestDatabase } from "../test/test-database";
import { archiveWallet } from "../wallets/wallets";
import {
  deleteExpense,
  getCategories,
  getQuickLogOptions,
  logExpense,
  restoreExpense,
} from "./expenses";

let test: TestDatabase;
let n = 0;
const today = "2026-10-01";
const now = new Date("2026-10-01T10:00:00Z");

beforeAll(async () => {
  test = await createTestDatabase();
  await seedDefaultCategories(test.db);
});
afterAll(async () => {
  await test.close();
});

/** Onboarded on Oct 1 with cash 100 and D17 50, rent 250 unpaid. */
async function student() {
  const [user] = await test.db
    .insert(users)
    .values({ name: "Amel", email: `expenses${++n}@example.com`, weeklyMode: false })
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
        fixedCosts: [{ key: "rent", amountMillimes: 250_000, alreadyPaid: false }],
        wallets: [
          { kind: "cash", balanceMillimes: 100_000 },
          { kind: "d17", balanceMillimes: 50_000 },
        ],
      },
      today,
    ),
    new Date("2026-10-01T08:00:00Z"),
  );
  const own = await test.db.select().from(wallets).where(eq(wallets.userId, user.id));
  const [cycle] = await test.db.select().from(cycles).where(eq(cycles.userId, user.id));
  return {
    userId: user.id,
    cash: own.find((w) => w.type === "cash")?.id ?? "",
    d17: own.find((w) => w.type === "d17")?.id ?? "",
    cycleId: cycle?.id ?? "",
  };
}

const categoryIds = new Map<string, string>();
async function category(key: string) {
  if (!categoryIds.has(key)) {
    const [row] = await test.db.select().from(categories).where(eq(categories.key, key));
    categoryIds.set(key, row?.id ?? "");
  }
  return categoryIds.get(key) ?? "";
}

async function coffee(userId: string, walletId: string, amountMillimes = 2_500, at = now) {
  const id = randomUUID();
  const result = await logExpense(
    test.db,
    userId,
    { id, amountMillimes, categoryId: await category("coffee"), walletId },
    at,
  );
  return { id, result };
}

describe("logExpense", () => {
  it("saves an expense that lowers what's left today, not today's amount", async () => {
    const { userId, cash, cycleId } = await student();
    const before = await getBudget(test.db, userId, today);

    const { id, result } = await coffee(userId, cash);
    expect(result).toBe("saved");

    const [row] = await test.db.select().from(transactions).where(eq(transactions.id, id));
    expect(row).toMatchObject({
      userId,
      cycleId,
      walletId: cash,
      type: "expense",
      source: "quick",
      amountMillimes: 2_500,
      occurredAt: now,
    });
    const after = await getBudget(test.db, userId, today);
    expect(after?.today.allowance).toBe(before?.today.allowance);
    expect(after?.today.left).toBe((before?.today.left ?? 0) - 2_500);
    expect(after?.todayExpenses).toEqual([
      {
        id,
        amountMillimes: 2_500,
        categoryId: await category("coffee"),
        walletId: cash,
        occurredAt: now,
        source: "quick",
        dailyPart: 2_500,
      },
    ]);
  });

  it("saves a retried expense once", async () => {
    const { userId, cash } = await student();
    const input = {
      id: randomUUID(),
      amountMillimes: 2_500,
      categoryId: await category("coffee"),
      walletId: cash,
    };
    const results = await Promise.all([
      logExpense(test.db, userId, input),
      logExpense(test.db, userId, input),
      logExpense(test.db, userId, input),
    ]);
    expect(results).toEqual(["saved", "saved", "saved"]);
    expect(await test.db.$count(transactions, eq(transactions.id, input.id))).toBe(1);
  });

  it("refuses fixed costs, archived wallets and unknown IDs", async () => {
    const { userId, cash, d17 } = await student();
    const log = async (categoryKey: string, walletId: string) =>
      logExpense(test.db, userId, {
        id: randomUUID(),
        amountMillimes: 1_000,
        categoryId: categoryKey === "?" ? randomUUID() : await category(categoryKey),
        walletId,
      });
    expect(await log("rent", cash)).toBe("not-found");
    expect(await log("phone_recharge", cash)).toBe("not-found");
    expect(await log("?", cash)).toBe("not-found");
    expect(await log("coffee", randomUUID())).toBe("not-found");
    await archiveWallet(test.db, userId, d17, { kind: "move", toWalletId: cash });
    expect(await log("coffee", d17)).toBe("not-found");
    expect(await log("groceries", cash)).toBe("saved");
  });

  it("marks spending covered by an envelope as not from today's money", async () => {
    const { userId, cash, cycleId } = await student();
    await test.db.insert(planItems).values({
      cycleId,
      kind: "envelope",
      categoryId: await category("groceries"),
      amountMillimes: 30_000,
    });
    const id = randomUUID();
    await logExpense(
      test.db,
      userId,
      { id, amountMillimes: 40_000, categoryId: await category("groceries"), walletId: cash },
      now,
    );
    const budget = await getBudget(test.db, userId, "2026-10-01");
    // 30 DT from the envelope, 10 DT from today's money.
    expect(budget?.todayExpenses.find((e) => e.id === id)?.dailyPart).toBe(10_000);
  });
});

describe("deleteExpense and restoreExpense", () => {
  it("soft-deletes an expense and brings it back", async () => {
    const { userId, cash } = await student();
    const { id } = await coffee(userId, cash);
    const left = async () => (await getBudget(test.db, userId, today))?.today.left;
    const withCoffee = await left();

    expect(await deleteExpense(test.db, userId, id, now)).toBe("done");
    expect(await deleteExpense(test.db, userId, id, now)).toBe("done");
    const [row] = await test.db.select().from(transactions).where(eq(transactions.id, id));
    expect(row?.deletedAt).toEqual(now);
    expect(await left()).toBe((withCoffee ?? 0) + 2_500);
    expect((await getBudget(test.db, userId, today))?.todayExpenses).toEqual([]);

    expect(await restoreExpense(test.db, userId, id)).toBe("done");
    expect(await left()).toBe(withCoffee);
  });

  it("only touches quick-log expenses, and not in an archived wallet", async () => {
    const { userId, cash, d17 } = await student();
    const [startingBalance] = await test.db
      .select({ id: transactions.id })
      .from(transactions)
      .where(eq(transactions.userId, userId));
    expect(await deleteExpense(test.db, userId, startingBalance?.id ?? "")).toBe("not-found");

    const { id } = await coffee(userId, d17);
    await archiveWallet(test.db, userId, d17, { kind: "move", toWalletId: cash });
    expect(await deleteExpense(test.db, userId, id)).toBe("wallet-archived");
  });
});

describe("getQuickLogOptions", () => {
  it("offers daily and envelope categories in the new-student order, never fixed costs", async () => {
    const { userId, cash } = await student();
    const options = await getQuickLogOptions(test.db, userId, now);
    expect(options.categories.map((c) => c.key)).toEqual([
      "coffee",
      "transport",
      "food_out",
      "going_out",
      "groceries",
      "studies",
      "health",
      "clothes",
      "other",
    ]);
    expect(options.categories.every((c) => !c.envelope && c.lastWalletId === null)).toBe(true);
    expect(options.defaultWalletId).toBe(cash);
    expect(options.wallets.map((w) => w.type)).toEqual(["cash", "d17"]);
  });

  it("puts the most used categories first, keeps 'other' last, and remembers wallets", async () => {
    const { userId, cash, d17, cycleId } = await student();
    const log = async (key: string, walletId: string, at = now) =>
      logExpense(
        test.db,
        userId,
        { id: randomUUID(), amountMillimes: 1_000, categoryId: await category(key), walletId },
        at,
      );
    await log("going_out", cash);
    await log("going_out", d17, new Date("2026-10-01T11:00:00Z"));
    await log("studies", cash);
    for (let i = 0; i < 3; i++) await log("other", cash);
    // Too old to count as recent use.
    await log("health", cash, new Date("2026-08-01T10:00:00Z"));
    await test.db.insert(planItems).values({
      cycleId,
      kind: "envelope",
      categoryId: await category("groceries"),
      amountMillimes: 30_000,
    });

    const options = await getQuickLogOptions(test.db, userId, now);
    expect(options.categories.map((c) => c.key)).toEqual([
      "going_out",
      "studies",
      "coffee",
      "transport",
      "food_out",
      "groceries",
      "health",
      "clothes",
      "other",
    ]);
    const byKey = (key: string) => options.categories.find((c) => c.key === key);
    expect(byKey("going_out")?.lastWalletId).toBe(d17);
    expect(byKey("studies")?.lastWalletId).toBe(cash);
    expect(byKey("groceries")?.envelope).toBe(true);

    // An archived wallet isn't remembered.
    await archiveWallet(test.db, userId, d17, { kind: "move", toWalletId: cash });
    const later = await getQuickLogOptions(test.db, userId, now);
    expect(later.categories.find((c) => c.key === "going_out")?.lastWalletId).toBeNull();
  });
});

// Required (CLAUDE.md): one student can't see or change another's expenses.
describe("isolation between users", () => {
  it("B can't log into A's wallet or with A's own category", async () => {
    const a = await student();
    const b = await student();
    const [own] = await test.db
      .insert(categories)
      .values({
        userId: a.userId,
        key: "gym",
        names: { ar: "جيم", fr: "Sport", en: "Gym" },
        icon: "dumbbell",
        color: "#000000",
        group: "daily",
      })
      .returning();

    expect(
      await logExpense(test.db, b.userId, {
        id: randomUUID(),
        amountMillimes: 1_000,
        categoryId: await category("coffee"),
        walletId: a.cash,
      }),
    ).toBe("not-found");
    expect(
      await logExpense(test.db, b.userId, {
        id: randomUUID(),
        amountMillimes: 1_000,
        categoryId: own?.id ?? "",
        walletId: b.cash,
      }),
    ).toBe("not-found");
    expect((await getCategories(test.db, b.userId)).some((c) => c.key === "gym")).toBe(false);
    expect((await getCategories(test.db, a.userId)).some((c) => c.key === "gym")).toBe(true);
    expect(await test.db.$count(transactions, eq(transactions.walletId, a.cash))).toBe(1);
  });

  it("B can't delete, restore or reuse the ID of A's expense, or see it", async () => {
    const a = await student();
    const b = await student();
    const { id } = await coffee(a.userId, a.cash);

    expect(await deleteExpense(test.db, b.userId, id)).toBe("not-found");
    expect(await restoreExpense(test.db, b.userId, id)).toBe("not-found");
    expect(
      await logExpense(test.db, b.userId, {
        id,
        amountMillimes: 1,
        categoryId: await category("coffee"),
        walletId: b.cash,
      }),
    ).toBe("not-found");

    expect((await getBudget(test.db, b.userId, today))?.todayExpenses).toEqual([]);
    const [row] = await test.db.select().from(transactions).where(eq(transactions.id, id));
    expect(row).toMatchObject({ userId: a.userId, deletedAt: null, amountMillimes: 2_500 });
    const options = await getQuickLogOptions(test.db, b.userId, now);
    expect(options.categories[0]?.key).toBe("coffee");
    expect(options.categories.every((c) => c.lastWalletId === null)).toBe(true);
  });
});
