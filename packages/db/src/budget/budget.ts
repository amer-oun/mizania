import {
  type CycleSummary,
  cycleSummary,
  type IsoDate,
  isTransferDue,
  type TodayBudget,
  todayBudget,
  weekStartAllowance,
} from "@mizania/core";
import { and, asc, eq, isNull, sql } from "drizzle-orm";

import type { Db } from "../client";
import { cycles, planItems, transactions, wallets, weekSnapshots } from "../schema";

// Today's spendable amount for one user (ADR 003, ADR 006). This only loads
// rows, scoped by the user's ID from the session; every number comes from
// packages/core.

export interface Budget {
  cycle: { id: string; startedOn: IsoDate; expectedNextOn: IsoDate; weeklyMode: boolean };
  /** On or after the expected transfer date: time to ask "did the money arrive?". */
  transferDue: boolean;
  summary: CycleSummary;
  today: TodayBudget;
}

/**
 * The budget of the user's active cycle on `today` (Africa/Tunis), or null
 * without an active cycle. In weekly mode, this week's amount is stored the
 * first time it's needed and reused after (ADR 006 §4).
 */
export async function getBudget(db: Db, userId: string, today: IsoDate): Promise<Budget | null> {
  const [cycle] = await db
    .select({
      id: cycles.id,
      startedOn: cycles.startedOn,
      expectedNextOn: cycles.expectedNextOn,
      weeklyMode: cycles.weeklyMode,
    })
    .from(cycles)
    .where(and(eq(cycles.userId, userId), eq(cycles.status, "active"), isNull(cycles.deletedAt)));
  if (!cycle) return null;

  const userWallets = await db
    .select({ id: wallets.id, archived: wallets.archived, deletedAt: wallets.deletedAt })
    .from(wallets)
    .where(eq(wallets.userId, userId));
  const items = await db
    .select({
      id: planItems.id,
      kind: planItems.kind,
      categoryId: planItems.categoryId,
      amountMillimes: planItems.amountMillimes,
      paidAt: planItems.paidAt,
    })
    .from(planItems)
    // The cycle is this user's (checked above); deleted plan items don't count.
    .where(and(eq(planItems.cycleId, cycle.id), isNull(planItems.deletedAt)));
  const rows = await db
    .select({
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

  const summary = cycleSummary({
    today,
    startedOn: cycle.startedOn,
    nextTransferOn: cycle.expectedNextOn,
    // A deleted wallet counts like an archived one: not in the money available.
    wallets: userWallets.map((w) => ({ id: w.id, archived: w.archived || w.deletedAt !== null })),
    planItems: items.map((i) => ({ ...i, paid: i.paidAt !== null })),
    transactions: rows.map((t) => ({ ...t, at: t.occurredAt.getTime() })),
  });

  const input = {
    today,
    startedOn: cycle.startedOn,
    nextTransferOn: cycle.expectedNextOn,
    poolNow: summary.poolNow,
    spentToday: summary.spentToday,
    spentThisWeekBeforeToday: summary.spentThisWeekBeforeToday,
  };
  const weekAllowance = cycle.weeklyMode
    ? await storedWeekAllowance(db, userId, cycle.id, weekStartAllowance(input))
    : undefined;

  return {
    cycle,
    transferDue: isTransferDue(today, cycle.expectedNextOn),
    summary,
    today: todayBudget({ ...input, weeklyMode: cycle.weeklyMode, weekAllowance }),
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
