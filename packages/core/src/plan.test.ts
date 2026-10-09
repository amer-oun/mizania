import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { addDays, type IsoDate } from "./cycle";
import { todayBudget, weekStartAllowance } from "./daily";
import {
  applyPlanDraft,
  checkPlanChange,
  envelopeLimits,
  fixedCostLimits,
  type PlanDraftItem,
  previewPlan,
  suggestGroceries,
  weekAfterPlanChange,
} from "./plan";
import {
  cycleSummary,
  type CycleSummaryInput,
  type SummaryPlanItem,
  type SummaryTransaction,
} from "./summary";

// Money arrived Oct 1, next transfer Oct 31. Today is Oct 10: 21 days left,
// in the second week (Oct 8–14, 5 days left in it, 23 days from its start).
const cycle = { startedOn: "2026-10-01", nextTransferOn: "2026-10-31", today: "2026-10-10" };
const wallets = [{ id: "card", archived: false }];
const noon = (day: IsoDate) => Date.parse(`${day}T12:00:00Z`);
const now = noon("2026-10-10") + 1_000;

let clock = 0;
function tx(day: IsoDate, t: Omit<SummaryTransaction, "day" | "at">): SummaryTransaction {
  clock += 1;
  return { ...t, day, at: noon(day) + clock };
}
const income = tx("2026-10-01", { type: "adjustment", walletId: "card", amountMillimes: 400_000 });
const groceries = (day: IsoDate, amountMillimes: number) =>
  tx(day, { type: "expense", walletId: "card", amountMillimes, categoryId: "groceries" });

const rent: SummaryPlanItem = {
  id: "rent",
  kind: "fixed",
  categoryId: "rent",
  amountMillimes: 100_000,
  paid: false,
};
/** 400 DT, rent 100 to pay: 300 DT of daily money. */
const data: CycleSummaryInput = { ...cycle, wallets, planItems: [rent], transactions: [income] };
const asDraft = (items: readonly SummaryPlanItem[]): PlanDraftItem[] =>
  items.map(({ id, kind, categoryId, amountMillimes }) => ({
    id,
    kind,
    categoryId,
    amountMillimes,
  }));
const groceriesEnvelope = (amountMillimes: number): PlanDraftItem => ({
  id: "food",
  kind: "envelope",
  categoryId: "groceries",
  amountMillimes,
});

describe("limits", () => {
  it("lets an unused fixed cost change freely, and go", () => {
    const cost = { id: "rent", planned: 100_000, paidSoFar: 0, left: 100_000, paid: false };
    expect(fixedCostLimits(cost)).toEqual({ locked: false, min: 0, removable: true });
  });

  it("keeps a partly paid fixed cost at least at what's paid, and in the plan", () => {
    const cost = { id: "rent", planned: 100_000, paidSoFar: 30_000, left: 70_000, paid: false };
    expect(fixedCostLimits(cost)).toEqual({ locked: false, min: 30_000, removable: false });
  });

  it("locks a fixed cost marked paid, or paid beyond its amount", () => {
    const paid = { id: "net", planned: 35_000, paidSoFar: 0, left: 0, paid: true };
    const over = { id: "steg", planned: 30_000, paidSoFar: 35_000, left: 0, paid: false };
    expect(fixedCostLimits(paid)).toEqual({ locked: true, min: 0, removable: false });
    expect(fixedCostLimits(over).locked).toBe(true);
  });

  it("closes a used envelope at what's spent, and locks an overspent one", () => {
    const unused = { categoryId: "groceries", planned: 60_000, spent: 0, left: 60_000 };
    const used = { categoryId: "groceries", planned: 60_000, spent: 40_000, left: 20_000 };
    const over = { categoryId: "groceries", planned: 60_000, spent: 70_000, left: 0 };
    expect(envelopeLimits(unused)).toEqual({ locked: false, min: 0, removable: true });
    expect(envelopeLimits(used)).toEqual({ locked: false, min: 40_000, removable: false });
    expect(envelopeLimits(over)).toEqual({ locked: true, min: 70_000, removable: false });
  });
});

describe("checkPlanChange", () => {
  const plan: SummaryPlanItem[] = [
    rent,
    { id: "steg", kind: "fixed", categoryId: "electricity", amountMillimes: 30_000, paid: true },
    { id: "food", kind: "envelope", categoryId: "groceries", amountMillimes: 60_000, paid: false },
    { id: "gift", kind: "envelope", categoryId: null, amountMillimes: 15_000, paid: false },
    { id: "save", kind: "savings", categoryId: null, amountMillimes: 50_000, paid: false },
  ];
  const history = [
    income,
    tx("2026-10-02", {
      type: "expense",
      walletId: "card",
      amountMillimes: 30_000,
      categoryId: "rent",
      planItemId: "rent",
    }),
    groceries("2026-10-03", 40_000),
  ];
  const summary = cycleSummary({ ...data, planItems: plan, transactions: history });
  const draft = asDraft(plan);
  const check = (after: PlanDraftItem[]) => checkPlanChange(summary, plan, after);
  const withAmount = (id: string, amountMillimes: number) =>
    draft.map((i) => (i.id === id ? { ...i, amountMillimes } : i));
  const without = (id: string) => draft.filter((i) => i.id !== id);

  it("accepts the same plan, new items and changes within the limits", () => {
    expect(check(draft)).toBeNull();
    expect(check(withAmount("rent", 30_000))).toBeNull();
    expect(check(withAmount("food", 40_000))).toBeNull();
    expect(check(withAmount("food", 90_000))).toBeNull();
    expect(check(withAmount("save", 1_000))).toBeNull();
    expect(check(without("save"))).toBeNull();
    expect(check(without("gift"))).toBeNull();
    expect(
      check([
        ...draft,
        { id: "studies", kind: "envelope", categoryId: "studies", amountMillimes: 20_000 },
        { id: "net", kind: "fixed", categoryId: "internet", amountMillimes: 35_000 },
      ]),
    ).toBeNull();
  });

  it("refuses an amount below what's used, and a used item removed", () => {
    expect(check(withAmount("rent", 29_000))).toBe("below-used");
    expect(check(withAmount("food", 39_000))).toBe("below-used");
    expect(check(without("food"))).toBe("below-used");
    expect(check(without("rent"))).toBe("has-payments");
  });

  it("refuses changing a locked item", () => {
    expect(check(withAmount("steg", 25_000))).toBe("locked");
    expect(check(without("steg"))).toBe("locked");
    const over = cycleSummary({
      ...data,
      planItems: plan,
      transactions: [...history, groceries("2026-10-04", 30_000)],
    });
    expect(checkPlanChange(over, plan, withAmount("food", 100_000))).toBe("locked");
    expect(checkPlanChange(over, plan, draft)).toBeNull();
  });

  it("refuses the same ID, category or savings line twice", () => {
    const studies: PlanDraftItem = {
      id: "s",
      kind: "envelope",
      categoryId: "studies",
      amountMillimes: 1_000,
    };
    expect(check([...draft, { ...studies, id: "food" }])).toBe("duplicate");
    expect(check([...draft, { ...studies, categoryId: "groceries" }])).toBe("duplicate");
    expect(
      check([...draft, { id: "s2", kind: "savings", categoryId: null, amountMillimes: 1_000 }]),
    ).toBe("duplicate");
  });

  it("refuses a change of kind or category, and a new item with the wrong category", () => {
    expect(
      check(draft.map((i) => (i.id === "save" ? { ...i, kind: "envelope" as const } : i))),
    ).toBe("changed");
    expect(check(draft.map((i) => (i.id === "rent" ? { ...i, categoryId: "internet" } : i)))).toBe(
      "changed",
    );
    expect(
      check([...draft, { id: "x", kind: "fixed", categoryId: null, amountMillimes: 1_000 }]),
    ).toBe("changed");
    expect(
      check([...without("save"), { id: "x", kind: "savings", categoryId: "x", amountMillimes: 1 }]),
    ).toBe("changed");
  });

  it("throws on an amount of 0", () => {
    expect(() => check(withAmount("save", 0))).toThrow(RangeError);
  });
});

describe("applyPlanDraft", () => {
  it("keeps what's paid and when an item covers from; a new one covers from now", () => {
    const plan: SummaryPlanItem[] = [
      { ...rent, paid: true },
      { ...rent, id: "studies", kind: "envelope", categoryId: "studies", coversFrom: 5 },
    ];
    expect(applyPlanDraft(plan, [...asDraft(plan), groceriesEnvelope(10_000)], now)).toEqual([
      { ...rent, paid: true, coversFrom: null },
      { ...plan[1], coversFrom: 5 },
      { ...groceriesEnvelope(10_000), paid: false, coversFrom: now },
    ]);
  });
});

describe("previewPlan", () => {
  const preview = (
    draft: PlanDraftItem[],
    weekly: { weeklyMode: boolean; weekAllowance?: number },
    summary = data,
  ) => previewPlan({ summary, draft, now, ...weekly });
  const withGroceries = [...asDraft(data.planItems), groceriesEnvelope(63_000)];

  it("normal mode: a groceries envelope lowers today's amount at once", () => {
    const { before, after, fromNextWeek } = preview(withGroceries, { weeklyMode: false });
    expect(before).toMatchObject({ reserved: 100_000, poolNow: 300_000 });
    expect(before.today.allowance).toBe(14_285); // 300 DT / 21 days
    expect(after).toMatchObject({ reserved: 163_000, poolNow: 237_000 });
    expect(after.today.allowance).toBe(11_285); // 3 DT less a day
    expect(fromNextWeek).toBe(false);
  });

  it("normal mode: a smaller plan raises today's amount at once", () => {
    const { after, fromNextWeek } = preview([], { weeklyMode: false });
    expect(after.today.allowance).toBe(19_047); // 400 DT / 21 days
    expect(fromNextWeek).toBe(false);
  });

  // The week started with 300 DT: 300 × 7 / 23 = 91.304, over 5 days left.
  const week = weekStartAllowance({
    ...cycle,
    poolNow: 300_000,
    spentToday: 0,
    spentThisWeekBeforeToday: 0,
  });

  it("weekly mode: a bigger plan lowers this week's amount at once", () => {
    expect(week.allowance).toBe(91_304);
    const { before, after, fromNextWeek } = preview(withGroceries, {
      weeklyMode: true,
      weekAllowance: week.allowance,
    });
    expect(before.today.allowance).toBe(18_260);
    // 237 × 7 / 23 = 72.130, over 5 days.
    expect(after.today.week?.allowance).toBe(72_130);
    expect(after.today.allowance).toBe(14_426);
    expect(fromNextWeek).toBe(false);
  });

  it("weekly mode: a smaller plan keeps this week's amount; it shows from next week", () => {
    const { before, after, fromNextWeek } = preview([], {
      weeklyMode: true,
      weekAllowance: week.allowance,
    });
    expect(after.poolNow).toBe(400_000);
    expect(after.today).toEqual(before.today);
    expect(fromNextWeek).toBe(true);
  });

  it("weekly mode without a stored week: the same, from the week rebuilt now", () => {
    const bigger = preview(withGroceries, { weeklyMode: true });
    expect(bigger.before.today.allowance).toBe(18_260);
    expect(bigger.after.today.allowance).toBe(14_426);
    const smaller = preview([], { weeklyMode: true });
    expect(smaller.after.today).toEqual(smaller.before.today);
    expect(smaller.fromNextWeek).toBe(true);
  });

  it("over budget: says how much the plan needs beyond the money", () => {
    const savings: PlanDraftItem = {
      id: "save",
      kind: "savings",
      categoryId: null,
      amountMillimes: 350_000,
    };
    const { after } = preview([...asDraft(data.planItems), savings], { weeklyMode: false });
    expect(after.poolNow).toBe(-50_000);
    expect(after.today.status).toBe("over_budget");
  });
});

describe("weekAfterPlanChange", () => {
  const after = { ...cycle, poolNow: 237_000, spentToday: 0, spentThisWeekBeforeToday: 0 };
  it("keeps the lower of the stored and the rebuilt amount", () => {
    expect(weekAfterPlanChange(91_304, after)).toBe(72_130);
    expect(weekAfterPlanChange(50_000, after)).toBe(50_000);
    expect(() => weekAfterPlanChange(0.5, after)).toThrow(RangeError);
  });
});

describe("suggestGroceries", () => {
  it("without groceries logged: 20% of this morning's daily money, down to 5 DT", () => {
    // 300 DT × 20% = 60 DT.
    expect(suggestGroceries(data, "groceries")).toBe(60_000);
    const poorer = { ...data, planItems: [{ ...rent, amountMillimes: 377_000 }] };
    // 23 DT × 20% = 4.6 DT: nothing.
    expect(suggestGroceries(poorer, "groceries")).toBeNull();
    const over = { ...data, planItems: [{ ...rent, amountMillimes: 500_000 }] };
    expect(suggestGroceries(over, "groceries")).toBeNull();
  });

  it("with groceries logged this cycle: the same pace until the transfer, up to 5 DT", () => {
    const logged = {
      ...data,
      transactions: [
        income,
        // Last cycle: not counted.
        groceries("2026-09-20", 90_000),
        // 20 DT in 10 days, 21 days left: 42 DT, so 45 DT.
        groceries("2026-10-02", 12_000),
        groceries("2026-10-10", 8_000),
      ],
    };
    expect(suggestGroceries(logged, "groceries")).toBe(45_000);
    // 1 millime in 30 days, 1 day left: nothing.
    const tiny = {
      ...data,
      today: "2026-10-30",
      transactions: [income, groceries("2026-10-02", 1)],
    };
    expect(suggestGroceries(tiny, "groceries")).toBeNull();
  });
});

// Random plans, histories and plan changes within the cycle.
const days = Array.from({ length: 10 }, (_, i) => addDays(cycle.startedOn, i));
const categories = ["coffee", "groceries", "studies", "rent", "electricity"];
const amount = fc.integer({ min: 1, max: 200_000 });

const randomPlan = fc
  .record({
    rent: amount,
    rentPaid: fc.boolean(),
    steg: amount,
    groceries: amount,
    studies: amount,
    savings: amount,
  })
  .map((p): SummaryPlanItem[] => [
    { id: "rent", kind: "fixed", categoryId: "rent", amountMillimes: p.rent, paid: p.rentPaid },
    { id: "steg", kind: "fixed", categoryId: "electricity", amountMillimes: p.steg, paid: false },
    {
      id: "g",
      kind: "envelope",
      categoryId: "groceries",
      amountMillimes: p.groceries,
      paid: false,
    },
    { id: "s", kind: "envelope", categoryId: "studies", amountMillimes: p.studies, paid: false },
    { id: "save", kind: "savings", categoryId: null, amountMillimes: p.savings, paid: false },
  ]);

const randomTx = fc.oneof(
  fc.record({
    day: fc.constantFrom(...days),
    type: fc.constant("expense" as const),
    walletId: fc.constant("card"),
    amountMillimes: amount,
    categoryId: fc.constantFrom(...categories),
    planItemId: fc.constantFrom(null, "rent", "steg"),
  }),
  fc.record({
    day: fc.constantFrom(...days),
    type: fc.constantFrom("income" as const, "adjustment" as const),
    walletId: fc.constant("card"),
    amountMillimes: amount,
  }),
);
const randomHistory = fc
  .array(randomTx, { maxLength: 30 })
  .map((list) => list.map((t, i) => ({ ...t, at: Date.parse(`${t.day}T08:00:00Z`) + i })));

/** What to do with each plan item, and maybe a new coffee envelope. */
const randomChange = fc.record({
  ops: fc.array(fc.oneof(fc.constant("keep" as const), fc.constant("remove" as const), amount), {
    minLength: 5,
    maxLength: 5,
  }),
  coffee: fc.option(amount, { nil: undefined }),
});
interface Change {
  ops: ("keep" | "remove" | number)[];
  coffee: number | undefined;
}

/** A change the student could make in the editor: within each item's limits. */
function draftOf(plan: SummaryPlanItem[], input: CycleSummaryInput, change: Change) {
  const summary = cycleSummary(input);
  const draft = plan.flatMap((item, i): PlanDraftItem[] => {
    const op = change.ops[i] ?? "keep";
    const keep = asDraft([item]);
    const limits =
      item.kind === "fixed"
        ? fixedCostLimits(summary.fixedCosts.find((c) => c.id === item.id) ?? fail())
        : item.kind === "envelope"
          ? envelopeLimits(
              summary.envelopes.find((e) => e.categoryId === item.categoryId) ?? fail(),
            )
          : { locked: false, min: 0, removable: true };
    if (op === "keep" || limits.locked) return keep;
    if (op === "remove") {
      if (limits.removable) return [];
      return limits.min > 0 && item.kind === "envelope"
        ? [{ ...(keep[0] ?? fail()), amountMillimes: limits.min }]
        : keep;
    }
    return [{ ...(keep[0] ?? fail()), amountMillimes: Math.max(op, limits.min) }];
  });
  if (change.coffee !== undefined) {
    draft.push({ id: "c", kind: "envelope", categoryId: "coffee", amountMillimes: change.coffee });
  }
  return { summary, draft };
}
function fail(): never {
  throw new Error("missing status");
}

const setup = (plan: SummaryPlanItem[], history: SummaryTransaction[]) => {
  const input: CycleSummaryInput = { ...cycle, wallets, planItems: plan, transactions: history };
  const latest = Math.max(0, ...history.map((t) => t.at));
  return { input, saveAt: latest + 1 };
};

describe("plan change properties", () => {
  it("accepts every change made within the limits", () => {
    fc.assert(
      fc.property(randomPlan, randomHistory, randomChange, (plan, history, change) => {
        const { input } = setup(plan, history);
        const { summary, draft } = draftOf(plan, input, change);
        expect(checkPlanChange(summary, plan, draft)).toBeNull();
      }),
    );
  });

  it("never changes what was spent from the daily money on any day", () => {
    fc.assert(
      fc.property(randomPlan, randomHistory, randomChange, (plan, history, change) => {
        const { input, saveAt } = setup(plan, history);
        const { summary, draft } = draftOf(plan, input, change);
        const after = cycleSummary({ ...input, planItems: applyPlanDraft(plan, draft, saveAt) });
        expect(after.spendingByDay).toEqual(summary.spendingByDay);
      }),
    );
  });

  it("weekly mode: never raises this week's amount, or undoes an overspent week", () => {
    fc.assert(
      fc.property(
        randomPlan,
        randomHistory,
        randomChange,
        fc.option(fc.integer({ min: 0, max: 300_000 }), { nil: undefined }),
        (plan, history, change, stored) => {
          const { input, saveAt } = setup(plan, history);
          const { summary, draft } = draftOf(plan, input, change);
          const { before, after } = previewPlan({
            summary: input,
            weeklyMode: true,
            weekAllowance: stored,
            draft,
            now: saveAt,
          });
          const beforeWeek = before.today.week ?? fail();
          const afterWeek = after.today.week ?? fail();
          if (stored !== undefined) expect(afterWeek.allowance).toBeLessThanOrEqual(stored);
          // Spent more this week than its amount: still overspent after any change.
          const spentThisWeek = summary.spentThisWeekBeforeToday + summary.spentToday;
          if (spentThisWeek > beforeWeek.allowance) {
            expect(afterWeek.left).toBeLessThan(0);
          }
        },
      ),
    );
  });

  it("a bigger plan never raises today's amount, in either mode", () => {
    fc.assert(
      fc.property(
        randomPlan,
        randomHistory,
        randomChange,
        fc.boolean(),
        (plan, history, change, weeklyMode) => {
          const { input, saveAt } = setup(plan, history);
          const { summary, draft } = draftOf(plan, input, change);
          const after = cycleSummary({ ...input, planItems: applyPlanDraft(plan, draft, saveAt) });
          fc.pre(after.reserved.total >= summary.reserved.total);
          const budget = {
            ...cycle,
            poolNow: summary.poolNow,
            spentToday: summary.spentToday,
            spentThisWeekBeforeToday: summary.spentThisWeekBeforeToday,
            weeklyMode,
          };
          const stored = weeklyMode ? weekStartAllowance(budget).allowance : undefined;
          const preview = previewPlan({
            summary: input,
            weeklyMode,
            weekAllowance: stored,
            draft,
            now: saveAt,
          });
          expect(preview.before.today).toEqual(todayBudget({ ...budget, weekAllowance: stored }));
          expect(preview.after.today.allowance).toBeLessThanOrEqual(preview.before.today.allowance);
          expect(preview.fromNextWeek).toBe(false);
        },
      ),
    );
  });
});
