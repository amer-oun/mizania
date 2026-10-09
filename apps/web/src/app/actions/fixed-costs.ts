"use server";

import { markFixedCostPaid, payFixedCost, undoFixedCostPayment } from "@mizania/db/plan";
import { payFixedCostSchema, planItemIdSchema } from "@mizania/shared";

import { fail, ok, runWalletAction, type WalletActionResult } from "@/lib/wallet-action";

// Paying the fixed costs of the plan. Another user's plan item or wallet gets
// "not-found", like one that doesn't exist.

/** Safe to retry: the client sends the same `id` again. */
export async function payFixedCostAction(input: unknown): Promise<WalletActionResult> {
  return runWalletAction("pay_fixed_cost", payFixedCostSchema, input, async (db, userId, data) => {
    const result = await payFixedCost(db, userId, data);
    return result === "saved" ? ok : fail(result);
  });
}

export async function markFixedCostPaidAction(input: unknown): Promise<WalletActionResult> {
  return runWalletAction(
    "mark_fixed_cost_paid",
    planItemIdSchema,
    input,
    async (db, userId, data) => {
      const result = await markFixedCostPaid(db, userId, data.planItemId);
      return result === "done" ? ok : fail(result);
    },
  );
}

export async function undoFixedCostPaymentAction(input: unknown): Promise<WalletActionResult> {
  return runWalletAction("undo_fixed_cost", planItemIdSchema, input, async (db, userId, data) => {
    const result = await undoFixedCostPayment(db, userId, data.planItemId);
    return result === "done" ? ok : fail(result);
  });
}
