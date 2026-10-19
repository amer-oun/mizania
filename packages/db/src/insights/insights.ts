import { type IsoDate, type MonthByCategory, monthByCategory } from "@mizania/core";
import { and, desc, eq, isNull, or, sql } from "drizzle-orm";

import { activeCycle } from "../budget/budget";
import type { Db } from "../client";
import { categories, type CategoryNames, cycles, transactions } from "../schema";

// "This month by category" for one user (PLAN.md decision 12). This only
// loads rows, scoped by the user's ID from the session; the numbers come
// from packages/core.

export interface InsightCategory {
  id: string;
  key: string;
  names: CategoryNames;
  icon: string;
  color: string;
  group: "fixed" | "envelope" | "daily" | "income";
}

export interface MonthCategories {
  cycle: { id: string; startedOn: IsoDate; expectedNextOn: IsoDate };
  month: MonthByCategory;
  /** The categories of the rows (unlogged spending has none). */
  categories: InsightCategory[];
}

/**
 * This month's spending by category, compared with the last month that
 * ended (the one before it), or null without an active month.
 */
export async function getMonthByCategory(
  db: Db,
  userId: string,
  today: IsoDate,
): Promise<MonthCategories | null> {
  const cycle = await activeCycle(db, userId);
  if (!cycle) return null;
  const [last] = await db
    .select({
      id: cycles.id,
      startedOn: cycles.startedOn,
      actualEndOn: cycles.actualEndOn,
    })
    .from(cycles)
    .where(and(eq(cycles.userId, userId), eq(cycles.status, "closed"), isNull(cycles.deletedAt)))
    .orderBy(desc(cycles.startedOn), desc(cycles.createdAt))
    .limit(1);

  const rows = await db
    .select({
      categoryId: transactions.categoryId,
      walletId: transactions.walletId,
      cycleId: transactions.cycleId,
      amountMillimes: transactions.amountMillimes,
      occurredAt: transactions.occurredAt,
      // The calendar day it happened in Tunisia.
      day: sql<IsoDate>`to_char(${transactions.occurredAt} at time zone 'Africa/Tunis', 'YYYY-MM-DD')`,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, userId),
        eq(transactions.type, "expense"),
        isNull(transactions.deletedAt),
      ),
    );

  const month = monthByCategory({
    thisMonth: { cycleId: cycle.id, startedOn: cycle.startedOn, today },
    lastMonth: last
      ? {
          cycleId: last.id,
          startedOn: last.startedOn,
          endedOn: last.actualEndOn ?? cycle.startedOn,
        }
      : null,
    transactions: rows.map((t) => ({
      type: "expense",
      walletId: t.walletId,
      categoryId: t.categoryId,
      cycleId: t.cycleId,
      amountMillimes: t.amountMillimes,
      day: t.day,
      at: t.occurredAt.getTime(),
    })),
  });

  const ids = new Set(month.rows.flatMap((r) => (r.categoryId ? [r.categoryId] : [])));
  const shown = (
    await db
      .select({
        id: categories.id,
        key: categories.key,
        names: categories.names,
        icon: categories.icon,
        color: categories.color,
        group: categories.group,
      })
      .from(categories)
      .where(or(isNull(categories.userId), eq(categories.userId, userId)))
  ).filter((c) => ids.has(c.id));

  return {
    cycle: { id: cycle.id, startedOn: cycle.startedOn, expectedNextOn: cycle.expectedNextOn },
    month,
    categories: shown,
  };
}
