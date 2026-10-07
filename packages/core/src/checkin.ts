// Evening check-in (PLAN.md §4): compare what the app expected in a wallet
// with what the student counted. All amounts are integer millimes.

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
