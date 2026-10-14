import type { IsoDate, TodayBudgetInput } from "@mizania/core";
import { cycleSummary, weekStartAllowance } from "@mizania/core";
import { and, eq, gt, isNull, sql } from "drizzle-orm";

import type { Db } from "../client";
import { cycles, wallets, weekSnapshots } from "../schema";
import { budgetInput, loadCycleData } from "./budget";

// Helpers for changes to the user's active month, inside a transaction:
// lock it, check a wallet, and store this week's amount again after a change.

export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type WeekInput = Omit<TodayBudgetInput, "weeklyMode" | "weekAllowance">;
export type Cycle = Pick<
  typeof cycles.$inferSelect,
  "id" | "startedOn" | "expectedNextOn" | "weeklyMode"
>;

/** The user's active cycle, locked until the transaction ends. */
export async function lockActiveCycle(tx: Tx, userId: string, cycleId?: string) {
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

export async function activeWallet(tx: Tx, userId: string, walletId: string) {
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
 * `built_at` moves to `now` when the week takes the amount rebuilt from the
 * numbers after the change; otherwise the week still reflects the numbers
 * from before it.
 */
export async function storeWeekAgain(
  tx: Tx,
  userId: string,
  cycle: Cycle,
  before: WeekInput,
  after: WeekInput,
  rule: (stored: number, after: WeekInput) => number,
  now: Date,
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
  const rebuilt = allowance === week.allowance;
  // Not rebuilt and not stored yet: built from the numbers just before now.
  const builtAt = rebuilt ? now : new Date(now.getTime() - 1);
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
      builtAt,
    })
    .onConflictDoUpdate({
      target: [weekSnapshots.cycleId, weekSnapshots.weekIndex],
      set: {
        startsOn: week.start,
        endsOn: week.end,
        allowanceMillimes: allowance,
        builtAt: rebuilt ? now : sql`${weekSnapshots.builtAt}`,
      },
    });
}

/** This month's numbers for todayBudget, as the rows are now. */
export async function weekInput(tx: Tx, userId: string, cycle: Cycle, today: IsoDate) {
  const { input } = await loadCycleData(tx, userId, cycle, today);
  return { input, week: budgetInput(input, cycleSummary(input)) };
}
