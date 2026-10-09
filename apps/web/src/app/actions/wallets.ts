"use server";

import {
  addWallet,
  archiveWallet,
  moveWallet,
  renameWallet,
  restoreWallet,
} from "@mizania/db/wallets";
import {
  addWalletSchema,
  archiveWalletSchema,
  moveWalletSchema,
  renameWalletSchema,
  restoreWalletSchema,
} from "@mizania/shared";

import { fail, ok, runWalletAction, type WalletActionResult } from "@/lib/wallet-action";

// Wallet changes. Another user's wallet ID gets "not-found", like an ID that
// doesn't exist.

export async function addWalletAction(input: unknown): Promise<WalletActionResult> {
  return runWalletAction("add_wallet", addWalletSchema, input, async (db, userId, data) => {
    const result = await addWallet(db, userId, data);
    return result.status === "added" ? ok : fail(result.status);
  });
}

export async function renameWalletAction(input: unknown): Promise<WalletActionResult> {
  return runWalletAction("rename_wallet", renameWalletSchema, input, async (db, userId, data) => {
    const result = await renameWallet(db, userId, data.walletId, data.name);
    if (result === "renamed") return ok;
    // Only "other" wallets have a name; the screen never offers the rest.
    return fail(result === "not-other" ? "invalid" : result);
  });
}

export async function moveWalletAction(input: unknown): Promise<WalletActionResult> {
  return runWalletAction("move_wallet", moveWalletSchema, input, async (db, userId, data) => {
    const result = await moveWallet(db, userId, data.walletId, data.direction);
    return result === "moved" ? ok : fail(result);
  });
}

export async function archiveWalletAction(input: unknown): Promise<WalletActionResult> {
  return runWalletAction("archive_wallet", archiveWalletSchema, input, async (db, userId, data) => {
    const result = await archiveWallet(db, userId, data.walletId, data.choice);
    return result === "archived" ? ok : fail(result);
  });
}

export async function restoreWalletAction(input: unknown): Promise<WalletActionResult> {
  return runWalletAction("restore_wallet", restoreWalletSchema, input, async (db, userId, data) => {
    const result = await restoreWallet(db, userId, data.walletId);
    return result === "restored" ? ok : fail(result);
  });
}
