// Turns a cycle's data into the inputs of todayBudget and runOutForecast
// (ADR 006): what's available, what's reserved, and what was spent from the
// daily money on each day. All amounts are integer millimes.

import {
  addDays,
  assertIsoDate,
  cycleWeeks,
  daysBetween,
  type IsoDate,
  weekIndexFor,
} from "./cycle";
import { dailyPool } from "./daily";
import { assertMillimes } from "./money";
import { type BalanceTransaction, totalBalance, walletBalances } from "./wallets";

export type PlanItemKind = "fixed" | "envelope" | "savings";

export interface SummaryPlanItem {
  id: string;
  kind: PlanItemKind;
  categoryId: string | null;
  /** Planned for this cycle; more than 0. */
  amountMillimes: number;
  /** Fixed costs: marked as paid. */
  paid: boolean;
}

export interface SummaryTransaction extends BalanceTransaction {
  /** Set to get this transaction's daily part back in `dailyParts`. */
  id?: string | undefined;
  categoryId?: string | null | undefined;
  /** A fixed-cost payment: the plan item it pays. */
  planItemId?: string | null | undefined;
  /** The calendar day it happened, in Africa/Tunis. */
  day: IsoDate;
  /** When it happened (milliseconds), to order a day's transactions. */
  at: number;
}

export interface CycleSummaryInput {
  today: IsoDate;
  startedOn: IsoDate;
  nextTransferOn: IsoDate;
  /** All the user's wallets; archived ones don't count in `available`. */
  wallets: readonly { id: string; archived: boolean }[];
  planItems: readonly SummaryPlanItem[];
  /** All the user's transactions that aren't deleted, from any cycle. */
  transactions: readonly SummaryTransaction[];
}

export interface CycleSummary {
  /** Everything in the active wallets. */
  available: number;
  /** Set aside, by kind; `reserved.total` is their sum. */
  reserved: { fixed: number; envelopes: number; savings: number; total: number };
  /** available − reserved: the daily money right now. Can be negative. */
  poolNow: number;
  spentToday: number;
  spentThisWeekBeforeToday: number;
  /** Daily-money spending on each day from the cycle's start to today. */
  spendingByDay: { day: IsoDate; amount: number }[];
  /**
   * For each transaction of the cycle that has an `id`: how much of it came
   * out of the daily money (0 when it was covered by the plan, or isn't
   * spending at all).
   */
  dailyParts: Map<string, number>;
}

function checkPlanItem(item: SummaryPlanItem): void {
  assertMillimes(item.amountMillimes);
  if (item.amountMillimes <= 0) {
    throw new RangeError(`Invalid plan amount: ${item.amountMillimes} millimes.`);
  }
}

/**
 * Classifies the cycle's spending (ADR 006 §3) and sums what's set aside
 * (§2). Counted as daily-money spending, on the day it happened:
 * - expenses outside the plan's envelopes and fixed costs;
 * - the part of an envelope expense beyond what's left in the envelope;
 * - the part of a fixed-cost payment above what's planned for it;
 * - negative adjustments (money that's gone, e.g. archiving "I don't have it").
 * Transfers, income, positive adjustments and spending within the plan
 * aren't daily spending.
 */
export function cycleSummary(input: CycleSummaryInput): CycleSummary {
  const { today, startedOn, nextTransferOn } = input;
  assertIsoDate(today);
  const weeks = cycleWeeks(startedOn, nextTransferOn);
  // Weeks are 7 days from the cycle's start (weekIndexFor checks today).
  const weekStart = addDays(startedOn, weekIndexFor(today, weeks) * 7);

  const active = new Set(input.wallets.filter((w) => !w.archived).map((w) => w.id));
  const balances = walletBalances(
    input.wallets.map((w) => w.id),
    input.transactions,
  );
  const available = totalBalance(
    [...balances].filter(([id]) => active.has(id)).map(([, balance]) => balance),
  );

  // What's still to pay for each fixed cost, and what's left in each
  // envelope (matched to spending by category). A fixed cost marked paid
  // reserves nothing, but its payments still use up its planned amount.
  const fixedLeft = new Map<string, number>();
  const paidFixed = new Set<string>();
  const envelopeLeft = new Map<string, number>();
  let unmatchedEnvelopes = 0; // envelopes without a category: always set aside
  let savings = 0;
  for (const item of input.planItems) {
    checkPlanItem(item);
    if (item.kind === "fixed") {
      fixedLeft.set(item.id, item.amountMillimes);
      if (item.paid) paidFixed.add(item.id);
    } else if (item.kind === "savings") {
      savings += item.amountMillimes;
    } else if (item.categoryId === null) {
      unmatchedEnvelopes += item.amountMillimes;
    } else {
      const planned = envelopeLeft.get(item.categoryId) ?? 0;
      envelopeLeft.set(item.categoryId, planned + item.amountMillimes);
    }
  }

  /**
   * Takes `amount` from what's left under `key`, and returns the part that
   * didn't fit (daily spending). Null when `key` isn't in the plan.
   */
  const cover = (left: Map<string, number>, key: string | null | undefined, amount: number) => {
    if (!key) return null;
    const remaining = left.get(key);
    if (remaining === undefined) return null;
    const covered = Math.min(remaining, amount);
    left.set(key, remaining - covered);
    return amount - covered;
  };

  const spending = new Map<IsoDate, number>();
  const dailyParts = new Map<string, number>();
  const inCycle = input.transactions
    .filter((t) => daysBetween(startedOn, t.day) >= 0 && daysBetween(t.day, today) >= 0)
    .sort((a, b) => a.at - b.at);
  for (const t of inCycle) {
    let daily = 0;
    if (t.type === "expense") {
      daily =
        cover(fixedLeft, t.planItemId, t.amountMillimes) ??
        cover(envelopeLeft, t.categoryId, t.amountMillimes) ??
        t.amountMillimes;
    } else if (t.type === "adjustment" && t.amountMillimes < 0) {
      daily = -t.amountMillimes;
    }
    if (t.id !== undefined) dailyParts.set(t.id, daily);
    if (daily > 0) spending.set(t.day, (spending.get(t.day) ?? 0) + daily);
  }

  const fixed = totalBalance(
    [...fixedLeft].filter(([id]) => !paidFixed.has(id)).map(([, left]) => left),
  );
  const envelopes = totalBalance([...envelopeLeft.values(), unmatchedEnvelopes]);
  const total = totalBalance([fixed, envelopes, savings]);

  const spendingByDay: CycleSummary["spendingByDay"] = [];
  let spentThisWeekBeforeToday = 0;
  for (let day = startedOn; daysBetween(day, today) >= 0; day = addDays(day, 1)) {
    const amount = spending.get(day) ?? 0;
    spendingByDay.push({ day, amount });
    if (daysBetween(weekStart, day) >= 0 && day !== today) spentThisWeekBeforeToday += amount;
  }

  return {
    available,
    reserved: { fixed, envelopes, savings, total },
    poolNow: dailyPool(available, total),
    spentToday: spending.get(today) ?? 0,
    spentThisWeekBeforeToday,
    spendingByDay,
    dailyParts,
  };
}
