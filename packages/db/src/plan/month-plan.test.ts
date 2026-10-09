import { randomUUID } from "node:crypto";

import { type PlanDraftItem, planOnboarding } from "@mizania/core";
import { and, eq, isNull } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getBudget } from "../budget/budget";
import { logExpense } from "../expenses/expenses";
import { saveOnboarding } from "../onboarding/save-onboarding";
import { categories, cycles, planItems, users, wallets, weekSnapshots } from "../schema";
import { seedDefaultCategories } from "../seed/seed-default-categories";
import { createTestDatabase, type TestDatabase } from "../test/test-database";
import { payFixedCost } from "./fixed-costs";
import { getPlanEditor, savePlan } from "./month-plan";

let test: TestDatabase;
let n = 0;
const today = "2026-10-11";
const now = new Date("2026-10-11T10:00:00Z");
const category: Record<string, string> = {};

beforeAll(async () => {
  test = await createTestDatabase();
  await seedDefaultCategories(test.db);
  const rows = await test.db
    .select({ id: categories.id, key: categories.key })
    .from(categories)
    .where(isNull(categories.userId));
  for (const row of rows) category[row.key] = row.id;
});
afterAll(async () => {
  await test.close();
});

/**
 * Onboarded on Oct 11, money expected on the 31st (20 days): cash 300 and
 * D17 50; rent 100 and STEG 30 to pay, internet already paid, and a 20 DT
 * phone recharge envelope. Daily money: 350 − 150 = 200, so 10 DT a day.
 */
async function student(weeklyMode = false) {
  const [user] = await test.db
    .insert(users)
    .values({ name: "Amel", email: `month-plan${++n}@example.com`, weeklyMode })
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
  const editor = await getPlanEditor(test.db, user.id, today);
  if (!editor) throw new Error("no plan");
  const [cash] = await test.db
    .select({ id: wallets.id })
    .from(wallets)
    .where(and(eq(wallets.userId, user.id), eq(wallets.type, "cash")));
  const items: PlanDraftItem[] = editor.input.planItems.map((i) => ({
    id: i.id,
    kind: i.kind,
    categoryId: i.categoryId,
    amountMillimes: i.amountMillimes,
  }));
  const itemOf = (key: string) => items.find((i) => i.categoryId === category[key]) ?? fail();
  return {
    userId: user.id,
    cycleId: editor.cycleId,
    cash: cash?.id ?? "",
    items,
    rent: itemOf("rent"),
    steg: itemOf("electricity"),
    internet: itemOf("internet"),
    recharge: itemOf("phone_recharge"),
  };
}
function fail(): never {
  throw new Error("missing");
}

const envelope = (key: string, amountMillimes: number): PlanDraftItem => ({
  id: randomUUID(),
  kind: "envelope",
  categoryId: category[key] ?? fail(),
  amountMillimes,
});
const savings = (amountMillimes: number): PlanDraftItem => ({
  id: randomUUID(),
  kind: "savings",
  categoryId: null,
  amountMillimes,
});
const save = (s: { userId: string; cycleId: string }, items: PlanDraftItem[], at: Date = now) =>
  savePlan(test.db, s.userId, { cycleId: s.cycleId, items }, today, at);
const todayOf = async (userId: string) => (await getBudget(test.db, userId, today))?.today;
const spend = (userId: string, walletId: string, key: string, amount: number, at: Date) =>
  logExpense(
    test.db,
    userId,
    { id: randomUUID(), amountMillimes: amount, categoryId: category[key] ?? fail(), walletId },
    at,
  );
const liveItems = (cycleId: string) =>
  test.db
    .select()
    .from(planItems)
    .where(and(eq(planItems.cycleId, cycleId), isNull(planItems.deletedAt)));

describe("getPlanEditor", () => {
  it("gives the plan, what the preview needs, the categories and the groceries suggestion", async () => {
    const s = await student();
    const editor = await getPlanEditor(test.db, s.userId, today);
    expect(editor?.weeklyMode).toBe(false);
    expect(editor?.input.planItems).toHaveLength(4);
    expect(editor?.plan.savings).toBe(0);
    expect(editor?.categories.map((c) => c.key)).toEqual([
      "rent",
      "electricity",
      "water",
      "internet",
      "trip_home",
      "phone_recharge",
      "groceries",
      "studies",
      "health",
      "clothes",
    ]);
    // 20% of 200 DT of daily money.
    expect(editor?.groceries).toEqual({ categoryId: category.groceries, suggested: 40_000 });
  });

  it("suggests nothing once groceries are in the plan, and null without a cycle", async () => {
    const s = await student();
    await save(s, [...s.items, envelope("groceries", 60_000)]);
    expect((await getPlanEditor(test.db, s.userId, today))?.groceries).toBeNull();

    const [user] = await test.db
      .insert(users)
      .values({ name: "New", email: `month-plan${++n}@example.com` })
      .returning();
    expect(await getPlanEditor(test.db, user?.id ?? "", today)).toBeNull();
  });
});

describe("savePlan", () => {
  it("a groceries envelope lowers today's amount; groceries stay out of it until it's empty", async () => {
    const s = await student();
    expect(await todayOf(s.userId)).toMatchObject({ allowance: 10_000 });

    expect(await save(s, [...s.items, envelope("groceries", 60_000)])).toBe("saved");
    // 140 DT over 20 days.
    expect(await todayOf(s.userId)).toMatchObject({ allowance: 7_000, left: 7_000 });

    const later = new Date("2026-10-11T12:00:00Z");
    await spend(s.userId, s.cash, "groceries", 50_000, later);
    expect(await todayOf(s.userId)).toMatchObject({ allowance: 7_000, left: 7_000 });
    // 10 left in the envelope: 5 of these 15 is daily money.
    await spend(s.userId, s.cash, "groceries", 15_000, later);
    expect(await todayOf(s.userId)).toMatchObject({ allowance: 7_000, left: 2_000 });
  });

  it("a new envelope doesn't cover what was spent before it was added", async () => {
    const s = await student();
    await spend(s.userId, s.cash, "groceries", 4_000, new Date("2026-10-11T09:00:00Z"));
    expect(await todayOf(s.userId)).toMatchObject({ allowance: 10_000, left: 6_000 });

    await save(s, [...s.items, envelope("groceries", 60_000)]);
    // Still 4 DT spent today; the envelope sets aside all of its 60.
    expect(await todayOf(s.userId)).toMatchObject({ allowance: 7_000, left: 3_000 });
    const plan = (await getPlanEditor(test.db, s.userId, today))?.plan;
    expect(plan?.envelopes.find((e) => e.categoryKey === "groceries")).toMatchObject({
      planned: 60_000,
      spent: 0,
      left: 60_000,
    });
  });

  it("changes amounts, removes items, and keeps one savings line", async () => {
    const s = await student();
    const line = savings(40_000);
    const items = [
      { ...s.rent, amountMillimes: 90_000 },
      s.internet,
      { ...s.recharge, amountMillimes: 10_000 },
      line,
    ];
    expect(await save(s, items)).toBe("saved");
    // STEG removed: 350 − (90 + 10 + 40) = 210 over 20 days.
    expect(await todayOf(s.userId)).toMatchObject({ allowance: 10_500 });
    const rows = await liveItems(s.cycleId);
    expect(rows.map((r) => [r.kind, r.amountMillimes]).sort()).toEqual([
      ["envelope", 10_000],
      ["fixed", 35_000],
      ["fixed", 90_000],
      ["savings", 40_000],
    ]);
    expect(rows.find((r) => r.id === line.id)).toMatchObject({ categoryId: null, name: null });
    expect((await getPlanEditor(test.db, s.userId, today))?.plan.savings).toBe(40_000);

    expect(await save(s, [...items, savings(5_000)])).toBe("invalid");
    expect(
      await save(
        s,
        items.filter((i) => i !== line),
      ),
    ).toBe("saved");
    expect((await getPlanEditor(test.db, s.userId, today))?.plan.savings).toBe(0);
  });

  it("is safe to retry: the same plan saved twice adds its new items once", async () => {
    const s = await student();
    const items = [...s.items, envelope("groceries", 60_000), savings(10_000)];
    expect(await save(s, items)).toBe("saved");
    expect(await save(s, items)).toBe("saved");
    expect(await liveItems(s.cycleId)).toHaveLength(6);
    expect(await todayOf(s.userId)).toMatchObject({ allowance: 6_500 });
  });

  it("keeps a partly paid fixed cost at least at what's paid, and in the plan", async () => {
    const s = await student();
    await payFixedCost(
      test.db,
      s.userId,
      {
        id: randomUUID(),
        planItemId: s.rent.id,
        amountMillimes: 30_000,
        walletId: s.cash,
        final: false,
      },
      now,
    );
    const others = s.items.filter((i) => i.id !== s.rent.id);
    expect(await save(s, [...others, { ...s.rent, amountMillimes: 29_000 }])).toBe("invalid");
    expect(await save(s, others)).toBe("invalid");
    expect(await save(s, [...others, { ...s.rent, amountMillimes: 30_000 }])).toBe("saved");
    // Nothing left to set aside for rent: 350 − 30 paid − 50 = 270.
    expect(await todayOf(s.userId)).toMatchObject({ allowance: 13_500 });
  });

  it("locks a fixed cost marked paid", async () => {
    const s = await student();
    const others = s.items.filter((i) => i.id !== s.internet.id);
    expect(await save(s, [...others, { ...s.internet, amountMillimes: 40_000 }])).toBe("invalid");
    expect(await save(s, others)).toBe("invalid");
  });

  it("closes an envelope with spending at what's spent, never below", async () => {
    const s = await student();
    await spend(s.userId, s.cash, "phone_recharge", 5_000, now);
    const others = s.items.filter((i) => i.id !== s.recharge.id);
    expect(await save(s, others)).toBe("invalid");
    expect(await save(s, [...others, { ...s.recharge, amountMillimes: 4_000 }])).toBe("invalid");
    const before = await todayOf(s.userId);
    expect(await save(s, [...others, { ...s.recharge, amountMillimes: 5_000 }])).toBe("saved");
    // The 15 DT left in it go back to the daily money: 215 over 20 days.
    expect(await todayOf(s.userId)).toMatchObject({ allowance: 10_750, left: 10_750 });
    expect(before).toMatchObject({ allowance: 10_000, left: 10_000 });
  });

  it("refuses a category of another kind, a changed category, and a stale cycle", async () => {
    const s = await student();
    const fixedGroceries: PlanDraftItem = { ...envelope("groceries", 1_000), kind: "fixed" };
    expect(await save(s, [...s.items, fixedGroceries])).toBe("invalid");
    expect(await save(s, [...s.items, envelope("coffee", 1_000)])).toBe("invalid");
    expect(await save(s, [...s.items, envelope("rent", 1_000)])).toBe("invalid");
    expect(
      await save(s, [...s.items, { ...envelope("studies", 1_000), categoryId: randomUUID() }]),
    ).toBe("invalid");
    const moved = s.items.map((i) =>
      i.id === s.steg.id ? { ...i, categoryId: category.water ?? fail() } : i,
    );
    expect(await save(s, moved)).toBe("invalid");

    await test.db.update(cycles).set({ status: "closed" }).where(eq(cycles.id, s.cycleId));
    expect(await save(s, s.items)).toBe("not-found");
  });
});

describe("savePlan in weekly mode", () => {
  // Week 1 is Oct 11–17, 20 days to the transfer: 200 × 7 / 20 = 70 DT, 10 a day.
  const week = async (cycleId: string) =>
    (
      await test.db
        .select({ allowance: weekSnapshots.allowanceMillimes })
        .from(weekSnapshots)
        .where(eq(weekSnapshots.cycleId, cycleId))
    ).map((w) => w.allowance);

  it("a bigger plan lowers this week's amount at once; a smaller one never raises it", async () => {
    const s = await student(true);
    expect(await todayOf(s.userId)).toMatchObject({ allowance: 10_000 });
    expect(await week(s.cycleId)).toEqual([70_000]);

    const groceries = envelope("groceries", 60_000);
    expect(await save(s, [...s.items, groceries])).toBe("saved");
    // 140 × 7 / 20 = 49 DT.
    expect(await week(s.cycleId)).toEqual([49_000]);
    expect(await todayOf(s.userId)).toMatchObject({ allowance: 7_000 });

    // Without the envelope and STEG: more daily money, but only from next week.
    expect(
      await save(
        s,
        s.items.filter((i) => i.id !== s.steg.id),
      ),
    ).toBe("saved");
    expect(await week(s.cycleId)).toEqual([49_000]);
    expect(await todayOf(s.userId)).toMatchObject({ allowance: 7_000 });
  });

  it("stores the lower amount when the week wasn't stored yet", async () => {
    const s = await student(true);
    await test.db.delete(weekSnapshots).where(eq(weekSnapshots.cycleId, s.cycleId));
    expect(await save(s, [...s.items, envelope("groceries", 60_000)])).toBe("saved");
    expect(await week(s.cycleId)).toEqual([49_000]);
  });
});

describe("savePlan isolation", () => {
  it("B can't save A's plan, reuse A's item IDs, or change A's items", async () => {
    const a = await student();
    const b = await student();
    const before = await liveItems(a.cycleId);

    // A's cycle, as B.
    expect(
      await savePlan(test.db, b.userId, { cycleId: a.cycleId, items: a.items }, today, now),
    ).toBe("not-found");
    expect(await savePlan(test.db, b.userId, { cycleId: a.cycleId, items: [] }, today, now)).toBe(
      "not-found",
    );
    // A's items in B's plan are new IDs that are taken.
    expect(await save(b, [...b.items, { ...a.rent, amountMillimes: 1_000 }])).toBe("invalid");
    expect(await save(b, [...b.items, { ...envelope("groceries", 1_000), id: a.rent.id }])).toBe(
      "not-found",
    );

    expect(await liveItems(a.cycleId)).toEqual(before);
    expect(await liveItems(b.cycleId)).toHaveLength(4);
  });
});
