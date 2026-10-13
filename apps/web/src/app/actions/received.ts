"use server";

import { todayInTunis } from "@mizania/core";
import {
  moveExpectedDate,
  receiveExtraMoney,
  startNewMonth,
  undoExtraMoney,
} from "@mizania/db/received";
import {
  incomeIdSchema,
  moveExpectedDateSchema,
  receiveExtraSchema,
  startNewMonthSchema,
} from "@mizania/shared";

import { fail, ok, runWalletAction, type WalletActionResult } from "@/lib/wallet-action";

// Money received, and a late transfer. Another user's month or wallet gets
// "not-found", like one that doesn't exist.

/** Extra money in this month. Safe to retry: the client sends the same `id` again. */
export async function receiveExtraAction(input: unknown): Promise<WalletActionResult> {
  return runWalletAction("receive_extra", receiveExtraSchema, input, async (db, userId, data) => {
    const result = await receiveExtraMoney(db, userId, data, todayInTunis());
    return result === "saved" ? ok : fail(result);
  });
}

export async function undoExtraMoneyAction(input: unknown): Promise<WalletActionResult> {
  return runWalletAction("undo_extra", incomeIdSchema, input, async (db, userId, data) => {
    const result = await undoExtraMoney(db, userId, data.id, todayInTunis());
    return result === "done" ? ok : fail(result);
  });
}

/** Ends this month and starts the next. Safe to retry: the same `incomeId`. */
export async function startNewMonthAction(input: unknown): Promise<WalletActionResult> {
  return runWalletAction(
    "start_new_month",
    startNewMonthSchema,
    input,
    async (db, userId, data) => {
      const result = await startNewMonth(db, userId, data, todayInTunis());
      return result === "saved" ? ok : fail(result);
    },
  );
}

/** "Not yet", or a new date from the Plan tab. */
export async function moveExpectedDateAction(input: unknown): Promise<WalletActionResult> {
  return runWalletAction(
    "move_expected_date",
    moveExpectedDateSchema,
    input,
    async (db, userId, data) => {
      const result = await moveExpectedDate(db, userId, data, todayInTunis());
      return result === "saved" ? ok : fail(result);
    },
  );
}
