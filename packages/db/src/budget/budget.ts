import {
  type CycleSummary,
  cycleSummary,
  type CycleSummaryInput,
  type IsoDate,
  isTransferDue,
  type RunOutWarning,
  runOutWarning,
  type TodayBudget,
  todayBudget,
  waitingForNextWeek,
  weekStartAllowance,
} from "@mizania/core";
import { and, asc, eq, isNull, sql } from "drizzle-orm";

import type { Db } from "../client";
import {
  categories,
  checkins,
  cycles,
  planItems,
  type Transaction,
  transactions,
  wallets,
  weekSnapshots,
} from "../schema";

// Today's spendable amount for one user (ADR 003, ADR 006). This only loads
// rows, scoped by the user's ID from the session; every number comes from
// packages/core.

/** One of today's expenses, for the list under the number. */
export interface TodayExpense {
  id: string;
  amountMillimes: number;
  categoryId: string | null;
  walletId: string;
  occurredAt: Date;
  source: Transaction["source"];
  /** How much of it came out of the daily money (ADR 006). */
  dailyPart: number;
  /**
   * Unlogged spending found by a check-in: when the wallet was last counted
   * before (null: never, "since you started"). Null for other expenses.
   */
  unlogged: { since: Date | null } | null;
}

export interface Budget {
  cycle: { id: string; startedOn: IsoDate; expectedNextOn: IsoDate; weeklyMode: boolean };
  /** On or after the expected transfer date: time to ask "did the money arrive?". */
  transferDue: boolean;
  /** What the numbers are computed from (for the plan preview). */
  input: CycleSummaryInput;
  summary: CycleSummary;
  today: TodayBudget;
  /** Today's expenses, newest first. */
  todayExpenses: TodayExpense[];
  /**
   * Weekly mode: money received or found this week after the week's amount
   * was built. It shows in the daily amount from next week.
   */
  waiting: { id: string | undefined; amountMillimes: number }[];
  /**
   * At the pace of this month's finished days (today excluded), the daily
   * money runs out before the next transfer (ADR 004). Null otherwise.
   */
  warning: RunOutWarning | null;
}

/** The database or a transaction: anything that can select. */
export type Queryable = Pick<Db, "select">;

type ActiveCycle = Budget["cycle"];

/** The user's active cycle, or undefined. */
export async function activeCycle(q: Queryable, userId: string): Promise<ActiveCycle | undefined> {
  const [cycle] = await q
    .select({
      id: cycles.id,
      startedOn: cycles.startedOn,
      expectedNextOn: cycles.expectedNextOn,
      weeklyMode: cycles.weeklyMode,
    })
    .from(cycles)
    .where(and(eq(cycles.userId, userId), eq(cycles.status, "active"), isNull(cycles.deletedAt)));
  return cycle;
}

/**
 * Loads what cycleSummary needs for `cycle` (the user's, checked by the
 * caller): wallets, the plan items that aren't deleted, and every
 * transaction that isn't deleted.
 */
export async function loadCycleData(
  q: Queryable,
  userId: string,
  cycle: ActiveCycle,
  today: IsoDate,
) {
  const userWallets = await q
    .select({ id: wallets.id, archived: wallets.archived, deletedAt: wallets.deletedAt })
    .from(wallets)
    .where(eq(wallets.userId, userId));
  const items = await q
    .select({
      id: planItems.id,
      kind: planItems.kind,
      categoryId: planItems.categoryId,
      amountMillimes: planItems.amountMillimes,
      paidAt: planItems.paidAt,
      coversFrom: planItems.coversFrom,
    })
    .from(planItems)
    .leftJoin(categories, eq(categories.id, planItems.categoryId))
    .where(and(eq(planItems.cycleId, cycle.id), isNull(planItems.deletedAt)))
    // Plan order: oldest first, then the categories' order.
    .orderBy(asc(planItems.createdAt), asc(categories.position), asc(planItems.id));
  const rows = await q
    .select({
      id: transactions.id,
      source: transactions.source,
      type: transactions.type,
      walletId: transactions.walletId,
      toWalletId: transactions.toWalletId,
      categoryId: transactions.categoryId,
      planItemId: transactions.planItemId,
      cycleId: transactions.cycleId,
      amountMillimes: transactions.amountMillimes,
      occurredAt: transactions.occurredAt,
      // The calendar day it happened in Tunisia.
      day: sql<IsoDate>`to_char(${transactions.occurredAt} at time zone 'Africa/Tunis', 'YYYY-MM-DD')`,
    })
    .from(transactions)
    .where(and(eq(transactions.userId, userId), isNull(transactions.deletedAt)))
    .orderBy(asc(transactions.occurredAt), asc(transactions.createdAt), asc(transactions.id));

  const input: CycleSummaryInput = {
    cycleId: cycle.id,
    today,
    startedOn: cycle.startedOn,
    nextTransferOn: cycle.expectedNextOn,
    // A deleted wallet counts like an archived one: not in the money available.
    wallets: userWallets.map((w) => ({ id: w.id, archived: w.archived || w.deletedAt !== null })),
    planItems: items.map((i) => ({
      id: i.id,
      kind: i.kind,
      categoryId: i.categoryId,
      amountMillimes: i.amountMillimes,
      paid: i.paidAt !== null,
      coversFrom: i.coversFrom?.getTime() ?? null,
    })),
    transactions: rows.map((t) => ({
      id: t.id,
      type: t.type,
      walletId: t.walletId,
      toWalletId: t.toWalletId,
      categoryId: t.categoryId,
      planItemId: t.planItemId,
      cycleId: t.cycleId,
      amountMillimes: t.amountMillimes,
      day: t.day,
      at: t.occurredAt.getTime(),
    })),
  };
  return { input, rows };
}

/** todayBudget's input from a summary. */
export function budgetInput(input: CycleSummaryInput, summary: CycleSummary) {
  return {
    today: input.today,
    startedOn: input.startedOn,
    nextTransferOn: input.nextTransferOn,
    poolNow: summary.poolNow,
    spentToday: summary.spentToday,
    spentThisWeekBeforeToday: summary.spentThisWeekBeforeToday,
  };
}

/**
 * The budget of the user's active cycle on `today` (Africa/Tunis), or null
 * without an active cycle. In weekly mode, this week's amount is stored the
 * first time it's needed and reused after (ADR 006 §4).
 */
export async function getBudget(db: Db, userId: string, today: IsoDate): Promise<Budget | null> {
  const cycle = await activeCycle(db, userId);
  if (!cycle) return null;

  const { input: summaryInput, rows } = await loadCycleData(db, userId, cycle, today);
  const summary = cycleSummary(summaryInput);
  const input = budgetInput(summaryInput, summary);
  const week = cycle.weeklyMode
    ? await storedWeek(
        db,
        userId,
        cycle.id,
        weekStartAllowance(input),
        // Built from every transaction so far: the newest one's time.
        new Date(summaryInput.transactions.reduce((latest, t) => Math.max(latest, t.at), 0)),
      )
    : undefined;
  const weekAllowance = week?.allowance;

  const todayExpenses = rows
    // Spending logged in the last month this morning isn't this month's.
    .filter((t) => t.type === "expense" && t.day === today && (t.cycleId ?? cycle.id) === cycle.id)
    .reverse()
    .map((t) => ({
      id: t.id,
      amountMillimes: t.amountMillimes,
      categoryId: t.categoryId,
      walletId: t.walletId,
      occurredAt: t.occurredAt,
      source: t.source,
      dailyPart: summary.dailyParts.get(t.id) ?? 0,
      unlogged: null as { since: Date | null } | null,
    }));
  const found = todayExpenses.filter((e) => e.source === "checkin").map((e) => e.id);
  if (found.length > 0) {
    // Each count that found unlogged spending, and the count before it.
    const counts = await db
      .select({
        transactionId: checkins.transactionId,
        walletId: checkins.walletId,
        at: checkins.createdAt,
      })
      .from(checkins)
      .where(and(eq(checkins.userId, userId), isNull(checkins.deletedAt)))
      .orderBy(asc(checkins.createdAt));
    for (const expense of todayExpenses) {
      const index = counts.findIndex((c) => c.transactionId === expense.id);
      const count = counts[index];
      if (!count) continue;
      const before = counts.slice(0, index).filter((c) => c.walletId === count.walletId);
      expense.unlogged = { since: before.at(-1)?.at ?? null };
    }
  }

  return {
    cycle,
    transferDue: isTransferDue(today, cycle.expectedNextOn),
    input: summaryInput,
    summary,
    today: todayBudget({ ...input, weeklyMode: cycle.weeklyMode, weekAllowance }),
    todayExpenses,
    waiting: week ? waitingForNextWeek(summaryInput, week.builtAt.getTime()) : [],
    warning: runOutWarning({
      today,
      nextTransferOn: cycle.expectedNextOn,
      poolNow: summary.poolNow,
      // Finished days: this month's days before today.
      recentDailySpending: summary.spendingByDay.slice(0, -1).map((d) => d.amount),
    }),
  };
}

/**
 * This week's stored amount. The first call of the week stores `week`; a
 * concurrent or later call keeps the first one.
 */
async function storedWeek(
  db: Db,
  userId: string,
  cycleId: string,
  week: ReturnType<typeof weekStartAllowance>,
  builtAt: Date,
): Promise<{ allowance: number; builtAt: Date }> {
  await db
    .insert(weekSnapshots)
    .values({
      userId,
      cycleId,
      weekIndex: week.index,
      startsOn: week.start,
      endsOn: week.end,
      allowanceMillimes: week.allowance,
      builtAt,
    })
    .onConflictDoNothing({ target: [weekSnapshots.cycleId, weekSnapshots.weekIndex] });
  const [stored] = await db
    .select({ allowance: weekSnapshots.allowanceMillimes, builtAt: weekSnapshots.builtAt })
    .from(weekSnapshots)
    .where(
      and(
        eq(weekSnapshots.userId, userId),
        eq(weekSnapshots.cycleId, cycleId),
        eq(weekSnapshots.weekIndex, week.index),
      ),
    );
  if (!stored) throw new Error("getBudget: week snapshot not stored");
  return stored;
}
