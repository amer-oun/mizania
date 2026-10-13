"use server";

import { todayInTunis } from "@mizania/core";
import { savePlan } from "@mizania/db/plan";
import { savePlanSchema } from "@mizania/shared";

import { fail, ok, runWalletAction, type WalletActionResult } from "@/lib/wallet-action";

/**
 * Saves the whole month plan. Another user's cycle gets "not-found", like one
 * that isn't active any more. Safe to retry: new items' IDs come from the client.
 */
export async function savePlanAction(input: unknown): Promise<WalletActionResult> {
  return runWalletAction("save_plan", savePlanSchema, input, async (db, userId, data) => {
    const result = await savePlan(db, userId, data, todayInTunis());
    return result === "saved" ? ok : fail(result);
  });
}
