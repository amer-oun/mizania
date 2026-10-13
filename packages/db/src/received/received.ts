import { randomUUID } from "node:crypto";

import {
  applyPlanDraft,
  canExpectOn,
  checkPlanChange,
  copyPlan,
  cycleSummary,
  type CycleSummaryInput,
  type IncomeSource,
  isLikelyNewMonth,
  type IsoDate,
  newMonthInput,
  nextMonthExpectedOn,
  type PlanDraftItem,
  spentInCategory,
  type TodayBudgetInput,
  weekAfterIncome,
  weekAfterPlanChange,
  weekStartAllowance,
} from "@mizania/core";
import { and, desc, eq, gt, isNull } from "drizzle-orm";

import { budgetInput, loadCycleData } from "../budget/budget";
import type { Db } from "../client";
import { checkNewItems, getPlanEditor, type PlanEditor } from "../plan/month-plan";
import { cycles, planItems, transactions, users, wallets, weekSnapshots } from "../schema";

// Money received (ADR 006 §5–6): extra money, the monthly transfer that
// starts a new month, and a transfer that's late. Every function takes the
// user's ID from the session and scopes every query by it: another user's
// month or wallet gets "not-found", like one that doesn't exist.

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type WeekInput = Omit<TodayBudgetInput, "weeklyMode" | "weekAllowance">;
type Cycle = Pick<typeof cycles.$inferSelect, "id" | "startedOn" | "expectedNextOn" | "weeklyMode">;

/** What the "I received money" flow needs. */
export interface ReceiveOptions extends PlanEditor {
  /** "month" within 5 days of the expected date, else "extra". */
  defaultKind: "month" | "extra";
  /** The wallet that last received money, else D17, card, cash. */
  defaultWalletId: string | null;
  /** A new month's expected date: the usual arrival day, at least 20 days away. */
  nextExpectedOn: IsoDate;
  /** Money in the wallets now: what's left of this month, kept for the next one. */
  leftover: number;
  /** This month's plan, copied for the new month (new IDs). */
  copy: PlanDraftItem[];
  /** Groceries last month, for the new month's suggestion. */
  groceriesLastMonth: number;
}

export async function getReceiveOptions(
  db: Db,
  userId: string,
  today: IsoDate,
): Promise<ReceiveOptions | null> {
  const editor = await getPlanEditor(db, userId, today);
  if (!editor) return null;
  const [user] = await db
    .select({ arrivalDay: users.usualArrivalDay })
    .from(users)
    .where(eq(users.id, userId));
  const expectedOn = editor.input.nextTransferOn;
  const active = await db
    .select({ id: wallets.id, type: wallets.type })
    .from(wallets)
    .where(and(eq(wallets.userId, userId), eq(wallets.archived, false), isNull(wallets.deletedAt)))
    .orderBy(wallets.position, wallets.createdAt);
  const [lastIncome] = await db
    .select({ walletId: transactions.walletId })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, userId),
        eq(transactions.type, "income"),
        isNull(transactions.deletedAt),
      ),
    )
    .orderBy(desc(transactions.occurredAt))
    .limit(1);
  const byType = (type: string) => active.find((w) => w.type === type)?.id;
  const defaultWalletId =
    active.find((w) => w.id === lastIncome?.walletId)?.id ??
    byType("d17") ??
    byType("card") ??
    byType("cash") ??
    active[0]?.id ??
    null;
  const groceries = editor.categories.find((c) => c.key === "groceries");

  return {
    ...editor,
    defaultKind: isLikelyNewMonth(today, expectedOn) ? "month" : "extra",
    defaultWalletId,
    nextExpectedOn: nextMonthExpectedOn(today, user?.arrivalDay ?? Number(expectedOn.slice(8))),
    leftover: cycleSummary(editor.input).available,
    copy: copyPlan(editor.input.planItems, randomUUID),
    groceriesLastMonth: groceries ? spentInCategory(editor.input, groceries.id) : 0,
  };
}

/** The user's active cycle, locked until the transaction ends. */
async function lockActiveCycle(tx: Tx, userId: string, cycleId?: string) {
  const [cycle] = await tx
    .select({
      id: cycles.id,
      startedOn: cycles.startedOn,
      expectedNextOn: cycles.expectedNextOn,
      weeklyMode: cycles.weeklyMode,
    })
    .from(cycles)
    .where(
      and(
        cycleId === undefined ? undefined : eq(cycles.id, cycleId),
        eq(cycles.userId, userId),
        eq(cycles.status, "active"),
        isNull(cycles.deletedAt),
      ),
    )
    .for("update");
  return cycle;
}

async function activeWallet(tx: Tx, userId: string, walletId: string) {
  const [wallet] = await tx
    .select({ id: wallets.id })
    .from(wallets)
    .where(
      and(
        eq(wallets.id, walletId),
        eq(wallets.userId, userId),
        eq(wallets.archived, false),
        isNull(wallets.deletedAt),
      ),
    );
  return wallet;
}

/**
 * Weekly mode: stores this week's amount again after a change, from what
 * was stored (or rebuilt before the change when nothing was), by `rule`.
 * Later weeks of the cycle are deleted, to be stored when they come.
 */
async function storeWeekAgain(
  tx: Tx,
  userId: string,
  cycle: Cycle,
  before: WeekInput,
  after: WeekInput,
  rule: (stored: number, after: WeekInput) => number,
) {
  if (!cycle.weeklyMode) return;
  const current = weekStartAllowance(before);
  const [stored] = await tx
    .select({ allowance: weekSnapshots.allowanceMillimes })
    .from(weekSnapshots)
    .where(
      and(
        eq(weekSnapshots.userId, userId),
        eq(weekSnapshots.cycleId, cycle.id),
        eq(weekSnapshots.weekIndex, current.index),
      ),
    );
  const week = weekStartAllowance(after);
  const allowance = rule(stored?.allowance ?? current.allowance, after);
  await tx
    .delete(weekSnapshots)
    .where(and(eq(weekSnapshots.cycleId, cycle.id), gt(weekSnapshots.weekIndex, week.index)));
  await tx
    .insert(weekSnapshots)
    .values({
      userId,
      cycleId: cycle.id,
      weekIndex: week.index,
      startsOn: week.start,
      endsOn: week.end,
      allowanceMillimes: allowance,
    })
    .onConflictDoUpdate({
      target: [weekSnapshots.cycleId, weekSnapshots.weekIndex],
      set: { startsOn: week.start, endsOn: week.end, allowanceMillimes: allowance },
    });
}

/** This month's numbers for todayBudget, as the rows are now. */
async function weekInput(tx: Tx, userId: string, cycle: Cycle, today: IsoDate) {
  const { input } = await loadCycleData(tx, userId, cycle, today);
  return { input, week: budgetInput(input, cycleSummary(input)) };
}

/** An earlier income of this user with this ID: a retry. */
async function existingIncome(tx: Tx, userId: string, id: string) {
  const [row] = await tx
    .select({ userId: transactions.userId, type: transactions.type })
    .from(transactions)
    .where(eq(transactions.id, id));
  if (!row) return null;
  return row.userId === userId && row.type === "income" ? "saved" : "not-found";
}

export type ReceiveExtraResult = "saved" | "not-found";

/**
 * Extra money (a bourse, a job): an income in this month, now. It shows in
 * today's amount at once in normal mode, and from next week in weekly mode,
 * except when this week was stored at 0 (over budget): then the week is
 * rebuilt with the money. Safe to retry: `id` comes from the client.
 */
export async function receiveExtraMoney(
  db: Db,
  userId: string,
  input: { id: string; amountMillimes: number; walletId: string; source: IncomeSource },
  today: IsoDate,
  now: Date = new Date(),
): Promise<ReceiveExtraResult> {
  return db.transaction(async (tx) => {
    const cycle = await lockActiveCycle(tx, userId);
    if (!cycle) return "not-found";
    const retry = await existingIncome(tx, userId, input.id);
    if (retry) return retry;
    const wallet = await activeWallet(tx, userId, input.walletId);
    if (!wallet) return "not-found";

    const before = await weekInput(tx, userId, cycle, today);
    await tx.insert(transactions).values({
      id: input.id,
      userId,
      cycleId: cycle.id,
      walletId: wallet.id,
      type: "income",
      amountMillimes: input.amountMillimes,
      occurredAt: now,
      source: "manual",
      incomeSource: input.source,
    });
    const after = await weekInput(tx, userId, cycle, today);
    await storeWeekAgain(tx, userId, cycle, before.week, after.week, weekAfterIncome);
    return "saved";
  });
}

export type UndoIncomeResult = "done" | "not-found" | "wallet-archived";

/**
 * Undoes extra money of this month (a soft delete). In weekly mode the week
 * keeps the lower of its amount and the one rebuilt without the money.
 */
export async function undoExtraMoney(
  db: Db,
  userId: string,
  id: string,
  today: IsoDate,
  now: Date = new Date(),
): Promise<UndoIncomeResult> {
  return db.transaction(async (tx) => {
    const cycle = await lockActiveCycle(tx, userId);
    if (!cycle) return "not-found";
    const [income] = await tx
      .select({ id: transactions.id, archived: wallets.archived })
      .from(transactions)
      .innerJoin(wallets, eq(wallets.id, transactions.walletId))
      .where(
        and(
          eq(transactions.id, id),
          eq(transactions.userId, userId),
          eq(transactions.type, "income"),
          eq(transactions.cycleId, cycle.id),
          isNull(transactions.deletedAt),
        ),
      );
    if (!income) return "not-found";
    if (income.archived) return "wallet-archived";

    const before = await weekInput(tx, userId, cycle, today);
    await tx
      .update(transactions)
      .set({ deletedAt: now })
      .where(and(eq(transactions.id, income.id), eq(transactions.userId, userId)));
    const after = await weekInput(tx, userId, cycle, today);
    await storeWeekAgain(tx, userId, cycle, before.week, after.week, weekAfterPlanChange);
    return "done";
  });
}

export type StartNewMonthResult = "saved" | "not-found" | "invalid";

/**
 * The monthly transfer arrived: ends this month today and starts a new one
 * with the money received and the plan reviewed by the student. Leftover
 * money stays in the wallets and becomes part of the new month; last
 * month's plan, paid or not, stays with last month. In weekly mode the new
 * month's first week is stored at once.
 *
 * Safe to retry: `incomeId` comes from the client, and a second call after
 * the month started changes nothing.
 */
export async function startNewMonth(
  db: Db,
  userId: string,
  input: {
    cycleId: string;
    incomeId: string;
    amountMillimes: number;
    walletId: string;
    source: IncomeSource;
    expectedNextOn: IsoDate;
    items: PlanDraftItem[];
  },
  today: IsoDate,
  now: Date = new Date(),
): Promise<StartNewMonthResult> {
  return db.transaction(async (tx) => {
    const retry = await existingIncome(tx, userId, input.incomeId);
    if (retry) return retry;
    const old = await lockActiveCycle(tx, userId, input.cycleId);
    if (!old) return "not-found";
    if (!canExpectOn(input.expectedNextOn, today, today)) return "invalid";
    const wallet = await activeWallet(tx, userId, input.walletId);
    if (!wallet) return "not-found";
    const [user] = await tx
      .select({ weeklyMode: users.weeklyMode })
      .from(users)
      .where(eq(users.id, userId));
    const weeklyMode = user?.weeklyMode ?? old.weeklyMode;

    const cycleId = randomUUID();
    const { input: last } = await loadCycleData(tx, userId, old, today);
    const next: CycleSummaryInput = newMonthInput(last, {
      cycleId,
      nextTransferOn: input.expectedNextOn,
      income: { walletId: wallet.id, amountMillimes: input.amountMillimes, at: now.getTime() },
    });
    if (checkPlanChange(cycleSummary(next), [], input.items)) return "invalid";
    const problem = await checkNewItems(tx, userId, input.items);
    if (problem) return problem;

    await tx
      .update(cycles)
      .set({ status: "closed", actualEndOn: today })
      .where(and(eq(cycles.id, old.id), eq(cycles.userId, userId)));
    await tx.insert(cycles).values({
      id: cycleId,
      userId,
      startedOn: today,
      expectedNextOn: input.expectedNextOn,
      weeklyMode,
    });
    await tx.insert(transactions).values({
      id: input.incomeId,
      userId,
      cycleId,
      walletId: wallet.id,
      type: "income",
      amountMillimes: input.amountMillimes,
      occurredAt: now,
      source: "manual",
      incomeSource: input.source,
    });
    if (input.items.length > 0) {
      await tx.insert(planItems).values(
        input.items.map((i) => ({
          id: i.id,
          cycleId,
          kind: i.kind,
          categoryId: i.categoryId,
          amountMillimes: i.amountMillimes,
        })),
      );
    }

    if (weeklyMode) {
      const summary = cycleSummary({ ...next, planItems: applyPlanDraft([], input.items, 0) });
      const week = weekStartAllowance(budgetInput(next, summary));
      await tx
        .insert(weekSnapshots)
        .values({
          userId,
          cycleId,
          weekIndex: week.index,
          startsOn: week.start,
          endsOn: week.end,
          allowanceMillimes: week.allowance,
        })
        .onConflictDoNothing({ target: [weekSnapshots.cycleId, weekSnapshots.weekIndex] });
    }
    return "saved";
  });
}

export type MoveExpectedDateResult = "saved" | "not-found" | "invalid";

/**
 * "Not yet", or a new date set on the Plan tab: the money is now expected
 * on `expectedOn` (from today, after the month started). In weekly mode
 * this week keeps the lower of its amount and the one rebuilt with the new
 * date (or is rebuilt when it was stored at 0).
 */
export async function moveExpectedDate(
  db: Db,
  userId: string,
  input: { cycleId: string; expectedOn: IsoDate },
  today: IsoDate,
): Promise<MoveExpectedDateResult> {
  return db.transaction(async (tx) => {
    const cycle = await lockActiveCycle(tx, userId, input.cycleId);
    if (!cycle) return "not-found";
    if (!canExpectOn(input.expectedOn, today, cycle.startedOn)) return "invalid";

    const before = await weekInput(tx, userId, cycle, today);
    await tx
      .update(cycles)
      .set({ expectedNextOn: input.expectedOn })
      .where(and(eq(cycles.id, cycle.id), eq(cycles.userId, userId)));
    const moved = { ...cycle, expectedNextOn: input.expectedOn };
    const after = await weekInput(tx, userId, moved, today);
    await storeWeekAgain(tx, userId, moved, before.week, after.week, weekAfterPlanChange);
    return "saved";
  });
}
