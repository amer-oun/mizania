"use server";

import { transfer, undoTransfer } from "@mizania/db/wallets";
import { transferSchema, undoTransferSchema } from "@mizania/shared";

import { fail, ok, runWalletAction, type WalletActionResult } from "@/lib/wallet-action";

// Transfers between the student's own wallets. Mizania only records them;
// the money itself moves in D17, Flouci or at the ATM.

/** Safe to retry: the client sends the same `id` again. */
export async function transferAction(input: unknown): Promise<WalletActionResult> {
  return runWalletAction("transfer", transferSchema, input, async (db, userId, data) => {
    const result = await transfer(db, userId, data);
    return result === "saved" ? ok : fail(result);
  });
}

export async function undoTransferAction(input: unknown): Promise<WalletActionResult> {
  return runWalletAction("undo_transfer", undoTransferSchema, input, async (db, userId, data) => {
    const result = await undoTransfer(db, userId, data.transferId);
    return result === "undone" ? ok : fail(result);
  });
}
