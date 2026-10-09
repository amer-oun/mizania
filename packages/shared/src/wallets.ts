import { WALLET_NAME_MAX_LENGTH, walletKinds } from "@mizania/core";
import { z } from "zod";

import { notNegativeMillimes, positiveMillimes } from "./money";

// What the wallet screens send to the server. The user always comes from the
// session; these only describe the change.

export const TRANSFER_NOTE_MAX_LENGTH = 200;

const walletId = z.uuid();
const walletName = z.string().trim().min(1).max(WALLET_NAME_MAX_LENGTH);

export const addWalletSchema = z
  .object({
    kind: z.enum(walletKinds),
    name: z.string().trim().max(WALLET_NAME_MAX_LENGTH).optional(),
    balanceMillimes: notNegativeMillimes,
  })
  .strict()
  .refine((w) => w.kind !== "other" || (w.name !== undefined && w.name !== ""), {
    message: 'An "other" wallet needs a name',
    path: ["name"],
  })
  .transform((w) => ({ ...w, name: w.kind === "other" ? (w.name ?? null) : null }));
export type AddWalletInput = z.input<typeof addWalletSchema>;

export const renameWalletSchema = z.object({ walletId, name: walletName }).strict();
export type RenameWalletInput = z.infer<typeof renameWalletSchema>;

export const moveWalletSchema = z.object({ walletId, direction: z.enum(["up", "down"]) }).strict();
export type MoveWalletInput = z.infer<typeof moveWalletSchema>;

export const archiveWalletSchema = z
  .object({
    walletId,
    // How to empty it first; ignored when the balance is already 0.
    choice: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("move"), toWalletId: walletId }).strict(),
      z.object({ kind: z.literal("zero") }).strict(),
    ]),
  })
  .strict()
  .refine((a) => a.choice.kind !== "move" || a.choice.toWalletId !== a.walletId, {
    message: "Pick another wallet",
    path: ["choice", "toWalletId"],
  });
export type ArchiveWalletInput = z.infer<typeof archiveWalletSchema>;

export const restoreWalletSchema = z.object({ walletId }).strict();
export type RestoreWalletInput = z.infer<typeof restoreWalletSchema>;

export const transferSchema = z
  .object({
    // Made by the client, so a repeated request saves the transfer once.
    id: z.uuid(),
    fromWalletId: walletId,
    toWalletId: walletId,
    amountMillimes: positiveMillimes,
    note: z
      .string()
      .trim()
      .max(TRANSFER_NOTE_MAX_LENGTH)
      .optional()
      .transform((n) => (n === "" || n === undefined ? null : n)),
  })
  .strict()
  .refine((t) => t.fromWalletId !== t.toWalletId, {
    message: "Pick two different wallets",
    path: ["toWalletId"],
  });
export type TransferInput = z.input<typeof transferSchema>;

export const undoTransferSchema = z.object({ transferId: z.uuid() }).strict();
export type UndoTransferInput = z.infer<typeof undoTransferSchema>;
