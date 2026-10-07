// Run-out warnings (PLAN.md §4): "At this pace you'll run out on Oct 23,
// 8 days early. Spending 7.500 DT less per day fixes it."

import { addDays, assertIsoDate, daysLeft, type IsoDate } from "./cycle";
import { ceilDiv, floorDiv, mulDivFloor } from "./integer-math";
import { assertMillimes } from "./money";

export interface RunOutInput {
  today: IsoDate;
  nextTransferOn: IsoDate;
  /** Daily money right now. Can be negative. */
  poolNow: number;
  /** Spending of the last finished days, oldest first. Only the last 7 count. */
  recentDailySpending: readonly number[];
}

export type RunOutForecast =
  | { status: "not_enough_data" }
  | { status: "safe" }
  | { status: "out"; runsOutOn: IsoDate }
  | { status: "warning"; runsOutOn: IsoDate; daysShort: number; cutPerDay: number };

/** At least this many finished days are needed before judging the pace. */
const MIN_DAYS_OF_DATA = 3;
/** Only the most recent days count towards the pace. */
const PACE_WINDOW_DAYS = 7;

/**
 * Forecasts when the daily money runs out at the recent pace, and how much
 * less per day would make it last until the next transfer. Checked in order:
 * no money → "out"; under 3 days of data → "not_enough_data"; no spending or
 * enough days covered → "safe"; otherwise "warning".
 */
export function runOutForecast(input: RunOutInput): RunOutForecast {
  const { today, nextTransferOn, poolNow, recentDailySpending } = input;

  assertIsoDate(today);
  assertIsoDate(nextTransferOn);
  assertMillimes(poolNow);
  for (const spent of recentDailySpending) {
    assertMillimes(spent);
    if (spent < 0) {
      throw new RangeError(`Invalid daily spending: ${spent}. Spending can't be negative.`);
    }
  }

  // "out" only means no money left; that's true whatever the pace.
  if (poolNow <= 0) return { status: "out", runsOutOn: today };

  const recent = recentDailySpending.slice(-PACE_WINDOW_DAYS);
  if (recent.length < MIN_DAYS_OF_DATA) return { status: "not_enough_data" };

  const n = recent.length;
  const sum = recent.reduce((total, spent) => total + spent, 0);
  assertMillimes(sum);
  if (sum === 0) return { status: "safe" };

  const daysNeeded = daysLeft(today, nextTransferOn);
  // poolNow / (sum / n), in whole numbers: how many full days the money lasts.
  const daysCovered = mulDivFloor(poolNow, n, sum);
  if (daysCovered >= daysNeeded) return { status: "safe" };

  // Pace rounded up, so the suggested cut is never too small.
  const pace = ceilDiv(sum, n);
  const affordablePerDay = floorDiv(poolNow, daysNeeded);

  return {
    status: "warning",
    runsOutOn: addDays(today, daysCovered),
    daysShort: daysNeeded - daysCovered,
    cutPerDay: pace - affordablePerDay,
  };
}
