"use server";

import { deleteExpense, logExpense, restoreExpense } from "@mizania/db/expenses";
import { expenseIdSchema, logExpenseSchema } from "@mizania/shared";

import { fail, ok, runWalletAction, type WalletActionResult } from "@/lib/wallet-action";

// Quick log. Another user's wallet, category or expense gets "not-found",
// like one that doesn't exist.

/** Safe to retry: the client sends the same `id` again. */
export async function logExpenseAction(input: unknown): Promise<WalletActionResult> {
  return runWalletAction("log_expense", logExpenseSchema, input, async (db, userId, data) => {
    const result = await logExpense(db, userId, data);
    return result === "saved" ? ok : fail(result);
  });
}

export async function deleteExpenseAction(input: unknown): Promise<WalletActionResult> {
  return runWalletAction("delete_expense", expenseIdSchema, input, async (db, userId, data) => {
    const result = await deleteExpense(db, userId, data.transactionId);
    return result === "done" ? ok : fail(result);
  });
}

export async function restoreExpenseAction(input: unknown): Promise<WalletActionResult> {
  return runWalletAction("restore_expense", expenseIdSchema, input, async (db, userId, data) => {
    const result = await restoreExpense(db, userId, data.transactionId);
    return result === "done" ? ok : fail(result);
  });
}
