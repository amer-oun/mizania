import { randomUUID } from "node:crypto";

import {
  checkIn,
  type CheckInAnswer,
  type CheckInKind,
  checkInRecord,
  type IncomeSource,
  isCheckinEvening,
  type IsoDate,
  walletBalances,
  weekAfterIncome,
  weekAfterPlanChange,
} from "@mizania/core";
import { and, desc, eq, inArray, isNull, lt, or } from "drizzle-orm";

import { loadCycleData } from "../budget/budget";
import { activeWallet, lockActiveCycle, storeWeekAgain, type Tx, weekInput } from "../budget/month";
import type { Db } from "../client";
import { categories, checkins, transactions, users, wallets } from "../schema";

// The evening check-in (ADR 004, ADR 006 decisions 5 and 6): the student
// counts a wallet, and the difference with what the app expected is
// recorded. Every function takes the user's ID from the session and scopes
// every query by it.

/** The difference a check-in found: what was expected minus what was counted. */
const differenceOf = (c: { expectedMillimes: number; countedMillimes: number }) =>
  Math.abs(c.expectedMillimes - c.countedMillimes);

export interface LastCount {
  id: string;
  day: IsoDate;
  at: Date;
  kind: CheckInKind;
  /** Size of the difference; 0 for a match. */
  amountMillimes: number;
  /** For unlogged income: income, or a correction. */
  recorded: "expense" | "income" | "adjustment" | null;
}

export interface CheckinWallet {
  id: string;
  type: (typeof wallets.$inferSelect)["type"];
  name: string | null;
  /** The latest check-in of this wallet (the only one that can be undone). */
  last: LastCount | null;
}

export interface CheckinState {
  /** From 18:00 (or the student's earlier check-in time) until midnight. */
  evening: boolean;
  /** Active wallets, cash first. */
  wallets: CheckinWallet[];
  cashWalletId: string | null;
  /** The cash wallet was counted today. */
  cashCountedToday: boolean;
}

export async function getCheckinState(
  db: Db,
  userId: string,
  today: IsoDate,
  now: Date = new Date(),
): Promise<CheckinState> {
  const [user] = await db
    .select({ checkinTime: users.checkinTime })
    .from(users)
    .where(eq(users.id, userId));
  const active = await db
    .select({ id: wallets.id, type: wallets.type, name: wallets.name })
    .from(wallets)
    .where(and(eq(wallets.userId, userId), eq(wallets.archived, false), isNull(wallets.deletedAt)))
    .orderBy(wallets.position, wallets.createdAt);
  const last = await lastCounts(
    db,
    userId,
    active.map((w) => w.id),
  );
  const ordered = [
    ...active.filter((w) => w.type === "cash"),
    ...active.filter((w) => w.type !== "cash"),
  ];
  const cash = ordered.find((w) => w.type === "cash");

  return {
    evening: isCheckinEvening(now, user?.checkinTime ?? "21:00"),
    wallets: ordered.map((w) => ({ ...w, last: last.get(w.id) ?? null })),
    cashWalletId: cash?.id ?? null,
    cashCountedToday: cash !== undefined && last.get(cash.id)?.day === today,
  };
}

/** The latest check-in of each wallet. */
async function lastCounts(
  db: Db | Tx,
  userId: string,
  walletIds: string[],
): Promise<Map<string, LastCount>> {
  if (walletIds.length === 0) return new Map();
  const rows = await db
    .selectDistinctOn([checkins.walletId], {
      walletId: checkins.walletId,
      id: checkins.id,
      day: checkins.day,
      at: checkins.createdAt,
      kind: checkins.kind,
      expectedMillimes: checkins.expectedMillimes,
      countedMillimes: checkins.countedMillimes,
      recorded: transactions.type,
    })
    .from(checkins)
    .leftJoin(transactions, eq(transactions.id, checkins.transactionId))
    .where(
      and(
        eq(checkins.userId, userId),
        inArray(checkins.walletId, walletIds),
        isNull(checkins.deletedAt),
      ),
    )
    .orderBy(checkins.walletId, desc(checkins.createdAt));
  return new Map(
    rows.map((r) => [
      r.walletId,
      {
        id: r.id,
        day: r.day,
        at: r.at,
        kind: r.kind,
        amountMillimes: differenceOf(r),
        recorded: r.recorded === "transfer" ? null : r.recorded,
      },
    ]),
  );
}

export type SaveCheckInResult =
  | {
      status: "saved";
      kind: CheckInKind;
      amountMillimes: number;
      transactionId: string | null;
      since: Date | null;
    }
  | { status: "needs-answer"; amountMillimes: number }
  | { status: "changed"; kind: CheckInKind; amountMillimes: number }
  | { status: "not-found" };

/**
 * Saves a count of one of the user's active wallets, now. The expected
 * balance is computed here, from the transactions as they are:
 * - less than expected: one unlogged spending expense (daily money);
 * - more: nothing until she answers (income, or "I miscounted earlier");
 *   an answer to a difference that has changed meanwhile gets "changed";
 * - the same: only the check-in.
 * `since` is when that wallet was last counted (null: never), for "spent
 * without logging since your last count". Safe to retry: `id` comes from
 * the client.
 */
export async function saveCheckIn(
  db: Db,
  userId: string,
  input: {
    id: string;
    walletId: string;
    countedMillimes: number;
    answer?: CheckInAnswer | undefined;
    source?: IncomeSource | undefined;
    seenMillimes?: number | undefined;
  },
  today: IsoDate,
  now: Date = new Date(),
): Promise<SaveCheckInResult> {
  return db.transaction(async (tx) => {
    const cycle = await lockActiveCycle(tx, userId);
    if (!cycle) return { status: "not-found" };

    const [existing] = await tx
      .select({
        userId: checkins.userId,
        kind: checkins.kind,
        expectedMillimes: checkins.expectedMillimes,
        countedMillimes: checkins.countedMillimes,
        walletId: checkins.walletId,
        transactionId: checkins.transactionId,
        at: checkins.createdAt,
      })
      .from(checkins)
      .where(eq(checkins.id, input.id));
    if (existing) {
      if (existing.userId !== userId) return { status: "not-found" };
      return {
        status: "saved",
        kind: existing.kind,
        amountMillimes: differenceOf(existing),
        transactionId: existing.transactionId,
        since: await previousCount(tx, userId, existing.walletId, existing.at),
      };
    }
    const wallet = await activeWallet(tx, userId, input.walletId);
    if (!wallet) return { status: "not-found" };

    const { input: data } = await loadCycleData(tx, userId, cycle, today);
    const expected = walletBalances(
      data.wallets.map((w) => w.id),
      data.transactions,
    ).get(wallet.id);
    // The wallet is active, so it's one of data.wallets.
    if (expected === undefined) return { status: "not-found" };
    const result = checkIn(expected, input.countedMillimes);
    if (
      input.answer !== undefined &&
      (result.kind !== "unlogged_income" || result.amount !== input.seenMillimes)
    ) {
      return { status: "changed", kind: result.kind, amountMillimes: result.amount };
    }
    const record = checkInRecord(result, input.answer);
    if (record === "needs-answer") return { status: "needs-answer", amountMillimes: result.amount };

    const since = await previousCount(tx, userId, wallet.id, now);
    const before = await weekInput(tx, userId, cycle, today);
    const transactionId = record ? randomUUID() : null;
    if (record && transactionId) {
      await tx.insert(transactions).values({
        id: transactionId,
        userId,
        cycleId: cycle.id,
        walletId: wallet.id,
        type: record.type,
        amountMillimes: record.amountMillimes,
        occurredAt: now,
        source: "checkin",
        incomeSource: record.type === "income" ? (input.source ?? "other") : null,
      });
    }
    await tx.insert(checkins).values({
      id: input.id,
      userId,
      cycleId: cycle.id,
      walletId: wallet.id,
      day: today,
      expectedMillimes: expected,
      countedMillimes: input.countedMillimes,
      kind: result.kind,
      transactionId,
      createdAt: now,
    });
    // Money she has more than expected shows from next week in weekly mode,
    // like extra money (a week stored at 0 is rebuilt with it).
    if (record && record.type !== "expense") {
      const after = await weekInput(tx, userId, cycle, today);
      await storeWeekAgain(tx, userId, cycle, before.week, after.week, weekAfterIncome);
    }
    return {
      status: "saved",
      kind: result.kind,
      amountMillimes: result.amount,
      transactionId,
      since,
    };
  });
}

/** When `walletId` was counted before `at`, or null. */
async function previousCount(tx: Tx, userId: string, walletId: string, at: Date) {
  const [row] = await tx
    .select({ at: checkins.createdAt })
    .from(checkins)
    .where(
      and(
        eq(checkins.userId, userId),
        eq(checkins.walletId, walletId),
        lt(checkins.createdAt, at),
        isNull(checkins.deletedAt),
      ),
    )
    .orderBy(desc(checkins.createdAt))
    .limit(1);
  return row?.at ?? null;
}

export type UndoCheckInResult = "done" | "not-found" | "not-latest" | "wallet-archived";

/**
 * Undoes a check-in and the transaction it recorded (soft deletes). Only
 * the latest check-in of its wallet: undoing an earlier one would make the
 * later ones wrong. In weekly mode, undone income or correction follows
 * the plan-change rule for this week's amount.
 */
export async function undoCheckIn(
  db: Db,
  userId: string,
  id: string,
  today: IsoDate,
  now: Date = new Date(),
): Promise<UndoCheckInResult> {
  return db.transaction(async (tx) => {
    const cycle = await lockActiveCycle(tx, userId);
    if (!cycle) return "not-found";
    const [count] = await tx
      .select({
        id: checkins.id,
        walletId: checkins.walletId,
        at: checkins.createdAt,
        transactionId: checkins.transactionId,
        type: transactions.type,
        archived: wallets.archived,
      })
      .from(checkins)
      .innerJoin(wallets, eq(wallets.id, checkins.walletId))
      .leftJoin(transactions, eq(transactions.id, checkins.transactionId))
      .where(
        and(
          eq(checkins.id, id),
          eq(checkins.userId, userId),
          eq(checkins.cycleId, cycle.id),
          isNull(checkins.deletedAt),
        ),
      );
    if (!count) return "not-found";
    const [latest] = await tx
      .select({ id: checkins.id })
      .from(checkins)
      .where(
        and(
          eq(checkins.userId, userId),
          eq(checkins.walletId, count.walletId),
          isNull(checkins.deletedAt),
        ),
      )
      .orderBy(desc(checkins.createdAt), desc(checkins.id))
      .limit(1);
    if (latest?.id !== count.id) return "not-latest";
    if (count.archived) return "wallet-archived";

    const before = await weekInput(tx, userId, cycle, today);
    if (count.transactionId) {
      await tx
        .update(transactions)
        .set({ deletedAt: now })
        .where(and(eq(transactions.id, count.transactionId), eq(transactions.userId, userId)));
    }
    await tx
      .update(checkins)
      .set({ deletedAt: now })
      .where(and(eq(checkins.id, count.id), eq(checkins.userId, userId)));
    if (count.type === "income" || count.type === "adjustment") {
      const after = await weekInput(tx, userId, cycle, today);
      await storeWeekAgain(tx, userId, cycle, before.week, after.week, weekAfterPlanChange);
    }
    return "done";
  });
}

export type CategorizeResult = "saved" | "not-found" | "invalid";

/**
 * Gives unlogged spending a category (a daily or envelope category, like
 * quick log): it then counts like any expense in it, so an envelope of that
 * category covers it.
 */
export async function categorizeUnlogged(
  db: Db,
  userId: string,
  input: { transactionId: string; categoryId: string },
): Promise<CategorizeResult> {
  const [category] = await db
    .select({ id: categories.id, group: categories.group })
    .from(categories)
    .where(
      and(
        eq(categories.id, input.categoryId),
        or(isNull(categories.userId), eq(categories.userId, userId)),
        isNull(categories.deletedAt),
      ),
    );
  if (!category) return "not-found";
  if (category.group !== "daily" && category.group !== "envelope") return "invalid";
  const updated = await db
    .update(transactions)
    .set({ categoryId: category.id })
    .where(
      and(
        eq(transactions.id, input.transactionId),
        eq(transactions.userId, userId),
        eq(transactions.type, "expense"),
        eq(transactions.source, "checkin"),
        isNull(transactions.deletedAt),
      ),
    )
    .returning({ id: transactions.id });
  return updated.length > 0 ? "saved" : "not-found";
}
