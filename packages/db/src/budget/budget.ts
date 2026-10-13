import {
  type CycleSummary,
  cycleSummary,
  type CycleSummaryInput,
  type IsoDate,
  isTransferDue,
  type TodayBudget,
  todayBudget,
  weekStartAllowance,
} from "@mizania/core";
import { and, asc, eq, isNull, sql } from "drizzle-orm";

import type { Db } from "../client";
import {
  categories,
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
      amountMillimes: transactions.amountMillimes,
      occurredAt: transactions.occurredAt,
      // The calendar day it happened in Tunisia.
      day: sql<IsoDate>`to_char(${transactions.occurredAt} at time zone 'Africa/Tunis', 'YYYY-MM-DD')`,
    })
    .from(transactions)
    .where(and(eq(transactions.userId, userId), isNull(transactions.deletedAt)))
    .orderBy(asc(transactions.occurredAt), asc(transactions.createdAt), asc(transactions.id));

  const input: CycleSummaryInput = {
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
  const weekAllowance = cycle.weeklyMode
    ? await storedWeekAllowance(db, userId, cycle.id, weekStartAllowance(input))
    : undefined;

  const todayExpenses = rows
    .filter((t) => t.type === "expense" && t.day === today)
    .reverse()
    .map((t) => ({
      id: t.id,
      amountMillimes: t.amountMillimes,
      categoryId: t.categoryId,
      walletId: t.walletId,
      occurredAt: t.occurredAt,
      source: t.source,
      dailyPart: summary.dailyParts.get(t.id) ?? 0,
    }));

  return {
    cycle,
    transferDue: isTransferDue(today, cycle.expectedNextOn),
    input: summaryInput,
    summary,
    today: todayBudget({ ...input, weeklyMode: cycle.weeklyMode, weekAllowance }),
    todayExpenses,
  };
}

/**
 * This week's stored amount. The first call of the week stores `week`; a
 * concurrent or later call keeps the first one.
 */
async function storedWeekAllowance(
  db: Db,
  userId: string,
  cycleId: string,
  week: ReturnType<typeof weekStartAllowance>,
): Promise<number> {
  await db
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
  const [stored] = await db
    .select({ allowance: weekSnapshots.allowanceMillimes })
    .from(weekSnapshots)
    .where(
      and(
        eq(weekSnapshots.userId, userId),
        eq(weekSnapshots.cycleId, cycleId),
        eq(weekSnapshots.weekIndex, week.index),
      ),
    );
  if (!stored) throw new Error("getBudget: week snapshot not stored");
  return stored.allowance;
}
