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

/**
 * Weekly mode: the week's amount is its fair share of the money it started
 * with, pool × (days in this week) / (days from week start to transfer).
 * Each day then gets an equal share of what's left of the week this morning.
 *
 * Known limitation: the week's starting money is rebuilt from today's numbers
 * (poolNow + spentToday + spentThisWeekBeforeToday), so a plan change mid-week
 * shifts the week's amount. Phase 3 stores a week-start snapshot (ADR 003).
 */
function weeklyBudget(input: TodayBudgetInput, days: number, poolThisMorning: number): TodayBudget {
  const { today, startedOn, nextTransferOn, poolNow, spentToday, spentThisWeekBeforeToday } = input;

  const weeks = cycleWeeks(startedOn, nextTransferOn);
  const index = weekIndexFor(today, weeks);
  const week = weeks[index];
  // weekIndexFor returns an index into this same list (or throws), so the
  // week always exists. The check only satisfies noUncheckedIndexedAccess.
  /* v8 ignore next */
  if (!week) throw new RangeError(`No week found for ${today}.`);

  const poolAtWeekStart = poolThisMorning + spentThisWeekBeforeToday;
  const weekAllowance = mulDivFloor(
    Math.max(0, poolAtWeekStart),
    week.days,
    daysBetween(week.start, nextTransferOn),
  );

  // Days left in this week, today included. At least 1 when the transfer is
  // late and today is past the last week: today still has to be paid for.
  const weekDaysLeft = Math.max(1, daysBetween(today, week.end) + 1);
  const weekLeftThisMorning = weekAllowance - spentThisWeekBeforeToday;

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
