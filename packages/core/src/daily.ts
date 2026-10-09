// Today's spendable amount (PLAN.md §4). All amounts are integer millimes.

import { cycleWeeks, daysBetween, daysLeft, type IsoDate, weekIndexFor } from "./cycle";
import { mulDivFloor } from "./integer-math";
import { assertMillimes } from "./money";

export interface TodayBudgetInput {
  today: IsoDate;
  startedOn: IsoDate;
  nextTransferOn: IsoDate;
  /** Daily money right now (after today's spending so far). Can be negative. */
  poolNow: number;
  spentToday: number;
  spentThisWeekBeforeToday: number;
  weeklyMode: boolean;
  /**
   * Weekly mode: this week's amount as stored at its start (ADR 006). Without
   * it, the week's amount is rebuilt from today's numbers (ADR 003).
   */
  weekAllowance?: number | undefined;
}

/**
 * Checked in this order:
 * over_budget if poolNow < 0; else over_today if left < 0;
 * else over_week if weekly mode and week.left < 0; else on_track.
 */
export type TodayBudgetStatus = "on_track" | "over_today" | "over_week" | "over_budget";

export interface WeekBudget {
  index: number;
  allowance: number;
  left: number;
  daysLeft: number;
}

export interface TodayBudget {
  allowance: number;
  spent: number;
  left: number;
  daysLeft: number;
  status: TodayBudgetStatus;
  week: WeekBudget | null;
}

/**
 * The daily money: everything in the wallets minus what's set aside for unpaid
 * fixed costs, envelope remainders and savings. Negative means the reserved
 * money is more than what exists (the "over budget" state).
 */
export function dailyPool(available: number, reserved: number): number {
  assertMillimes(available);
  assertMillimes(reserved);
  const pool = available - reserved;
  assertMillimes(pool); // guards against absurd inputs overflowing the safe range
  return pool;
}

function statusFor(poolNow: number, left: number, week: WeekBudget | null): TodayBudgetStatus {
  if (poolNow < 0) return "over_budget";
  if (left < 0) return "over_today";
  if (week && week.left < 0) return "over_week";
  return "on_track";
}

function assertSpending(value: number, name: string): void {
  assertMillimes(value);
  if (value < 0) {
    throw new RangeError(`Invalid ${name}: ${value}. Spending can't be negative.`);
  }
}

/** The week that contains `today`, and its amount at its start. */
export interface WeekStart {
  index: number;
  start: IsoDate;
  end: IsoDate;
  allowance: number;
}

/**
 * Weekly mode: the week's amount is its fair share of the money it started
 * with, pool × (days in this week) / (days from week start to transfer).
 * The money it started with is rebuilt from today's numbers:
 * poolNow + spentToday + spentThisWeekBeforeToday. That's what a week
 * snapshot stores the first time it's needed (ADR 006).
 */
export function weekStartAllowance(
  input: Omit<TodayBudgetInput, "weeklyMode" | "weekAllowance">,
): WeekStart {
  const { today, startedOn, nextTransferOn, poolNow, spentToday, spentThisWeekBeforeToday } = input;
  assertMillimes(poolNow);
  assertSpending(spentToday, "spending today");
  assertSpending(spentThisWeekBeforeToday, "spending earlier this week");

  const weeks = cycleWeeks(startedOn, nextTransferOn);
  const index = weekIndexFor(today, weeks);
  const week = weeks[index];
  // weekIndexFor returns an index into this same list (or throws), so the
  // week always exists. The check only satisfies noUncheckedIndexedAccess.
  /* v8 ignore next */
  if (!week) throw new RangeError(`No week found for ${today}.`);

  const poolAtWeekStart = poolNow + spentToday + spentThisWeekBeforeToday;
  const allowance = mulDivFloor(
    Math.max(0, poolAtWeekStart),
    week.days,
    daysBetween(week.start, nextTransferOn),
  );
  return { index, start: week.start, end: week.end, allowance };
}

/**
 * Each day of the week gets an equal share of what's left of the week this
 * morning. That's never more than the money that exists this morning, even
 * when a stored week amount is larger (the plan changed mid-week).
 */
function weeklyBudget(input: TodayBudgetInput, days: number, poolThisMorning: number): TodayBudget {
  const { today, poolNow, spentToday, spentThisWeekBeforeToday } = input;
  const week = weekStartAllowance(input);
  const index = week.index;
  const weekAllowance = input.weekAllowance ?? week.allowance;

  // Days left in this week, today included. At least 1 when the transfer is
  // late and today is past the last week: today still has to be paid for.
  const weekDaysLeft = Math.max(1, daysBetween(today, week.end) + 1);
  // A stored week amount can't promise more than the money that exists this
  // morning. (A rebuilt one never does: it's a share of what the week
  // started with, so for it this changes nothing.)
  const weekLeftThisMorning = Math.min(
    weekAllowance - spentThisWeekBeforeToday,
    Math.max(0, poolThisMorning),
  );

  // Once the week is overspent, nothing is left for the rest of it: 0 a day.
  const allowance = Math.floor(Math.max(0, weekLeftThisMorning) / weekDaysLeft);
  const left = allowance - spentToday;
  const weekBudget: WeekBudget = {
    index,
    allowance: weekAllowance,
    left: weekLeftThisMorning - spentToday,
    daysLeft: weekDaysLeft,
  };

  return {
    allowance,
    spent: spentToday,
    left,
    daysLeft: days,
    status: statusFor(poolNow, left, weekBudget),
    week: weekBudget,
  };
}

/**
 * Today's spendable amount (PLAN.md §4). The amount is fixed from the money
 * she had at the START of today (poolNow + spentToday), so spending during
 * the day lowers what's left today, not today's amount. Whatever she doesn't
 * spend, or overspends, changes tomorrow's amount (rollover).
 */
export function todayBudget(input: TodayBudgetInput): TodayBudget {
  const { today, startedOn, nextTransferOn, poolNow, spentToday, weeklyMode } = input;

  assertMillimes(poolNow);
  assertSpending(spentToday, "spending today");
  assertSpending(input.spentThisWeekBeforeToday, "spending earlier this week");
  if (daysBetween(startedOn, nextTransferOn) < 1) {
    throw new RangeError(
      `Invalid cycle: next transfer ${nextTransferOn} must be after the start ${startedOn}.`,
    );
  }
  if (daysBetween(startedOn, today) < 0) {
    throw new RangeError(`Invalid date: ${today} is before the cycle started on ${startedOn}.`);
  }
  if (input.weekAllowance !== undefined) {
    assertSpending(input.weekAllowance, "week amount");
  }

  const days = daysLeft(today, nextTransferOn);
  const poolThisMorning = poolNow + spentToday;

  if (weeklyMode) {
    return weeklyBudget(input, days, poolThisMorning);
  }

  // Round down so the amounts never add up to more than the money that exists.
  // A negative pool gives 0: there is no daily money to spend.
  const allowance = Math.floor(Math.max(0, poolThisMorning) / days);
  const left = allowance - spentToday;

  return {
    allowance,
    spent: spentToday,
    left,
    daysLeft: days,
    status: statusFor(poolNow, left, null),
    week: null,
  };
}
