// Evening check-in (PLAN.md §4): compare what the app expected in a wallet
// with what the student counted. All amounts are integer millimes.

import { APP_TIME_ZONE } from "./constants";
import { assertMillimes } from "./money";

export type CheckInKind = "unlogged_spending" | "unlogged_income" | "match";

export interface CheckInResult {
  kind: CheckInKind;
  /** Size of the difference, never negative. 0 for a match. */
  amount: number;
}

function assertNotNegative(value: number, name: string): void {
  assertMillimes(value);
  if (value < 0) {
    throw new RangeError(`Invalid ${name}: ${value}. It can't be negative.`);
  }
}

/**
 * What the app thinks is in the wallet: the balance she last confirmed, plus
 * money logged in, minus money logged out since then. Can be negative when
 * more spending was logged than the money recorded.
 */
export function expectedBalance(lastConfirmed: number, moneyIn: number, moneyOut: number): number {
  assertMillimes(lastConfirmed);
  assertNotNegative(moneyIn, "money in");
  assertNotNegative(moneyOut, "money out");
  const expected = lastConfirmed + moneyIn - moneyOut;
  assertMillimes(expected);
  return expected;
}

/**
 * Compares the expected balance with what she counted. Less than expected
 * means spending she didn't log; more means money she didn't log receiving.
 */
export function checkIn(expected: number, reported: number): CheckInResult {
  assertMillimes(expected);
  assertNotNegative(reported, "reported balance");

  const difference = expected - reported;
  if (difference > 0) return { kind: "unlogged_spending", amount: difference };
  if (difference < 0) return { kind: "unlogged_income", amount: -difference };
  return { kind: "match", amount: 0 };
}

/** What the student says when she counted more than expected (decision 6). */
export type CheckInAnswer = "income" | "correction";

/** The transaction a check-in records, if any. */
export interface CheckInRecord {
  /**
   * expense: unlogged spending, daily money (ADR 006 §3). income: money she
   * forgot to log receiving. adjustment: "I miscounted earlier", a positive
   * correction. Neither of the last two is spending.
   */
  type: "expense" | "income" | "adjustment";
  /** More than 0. */
  amountMillimes: number;
}

/**
 * What a check-in records: nothing for a match, the unlogged spending for
 * less, and for more what she answered ("needs-answer" until she does).
 */
export function checkInRecord(
  result: CheckInResult,
  answer?: CheckInAnswer,
): CheckInRecord | null | "needs-answer" {
  if (result.kind === "match") return null;
  if (result.kind === "unlogged_spending") {
    return { type: "expense", amountMillimes: result.amount };
  }
  if (answer === undefined) return "needs-answer";
  return { type: answer === "income" ? "income" : "adjustment", amountMillimes: result.amount };
}

/** The check-in card opens at 18:00, or earlier at the student's check-in time. */
const EVENING_STARTS = "18:00";

// Created once: building an Intl formatter is slow.
const tunisTime = new Intl.DateTimeFormat("en-GB", {
  timeZone: APP_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  numberingSystem: "latn",
});

/** The time of day in Tunis, "HH:MM" (24 hours). */
export function timeInTunis(now: Date = new Date()): string {
  if (Number.isNaN(now.getTime())) {
    throw new RangeError("Invalid date: cannot tell the time in Tunis.");
  }
  return tunisTime.format(now);
}

/**
 * Whether the evening check-in card shows at `now`: from 18:00, or from the
 * student's check-in time ("HH:MM" or "HH:MM:SS") when that's earlier,
 * until midnight in Tunis.
 */
export function isCheckinEvening(now: Date, checkinTime: string): boolean {
  if (!/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(checkinTime)) {
    throw new RangeError(`Invalid check-in time: ${checkinTime}. Expected HH:MM.`);
  }
  const own = checkinTime.slice(0, 5);
  return timeInTunis(now) >= (own < EVENING_STARTS ? own : EVENING_STARTS);
}
