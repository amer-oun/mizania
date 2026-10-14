"use server";

import { type CheckInKind, todayInTunis } from "@mizania/core";
import { categorizeUnlogged, saveCheckIn, undoCheckIn } from "@mizania/db/checkin";
import {
  categorizeUnloggedSchema,
  checkInIdSchema,
  type CheckInInput,
  checkInSchema,
} from "@mizania/shared";

import {
  fail,
  ok,
  runWalletAction,
  type WalletActionError,
  type WalletActionResult,
} from "@/lib/wallet-action";

// The evening check-in. Another user's wallet or check-in gets "not-found",
// like one that doesn't exist.

export type CheckInActionResult =
  | {
      ok: true;
      kind: CheckInKind;
      amountMillimes: number;
      /** When this wallet was last counted (ISO), or null: never. */
      since: string | null;
      /** Weekly mode: money found that shows in the daily amount from next week. */
      nextWeek: boolean;
    }
  /** Counted more: ask "did you receive money?" first. Nothing is saved. */
  | { ok: false; error: "needs-answer"; amountMillimes: number }
  /** The difference changed between the count and the answer. Nothing is saved. */
  | { ok: false; error: "changed"; kind: CheckInKind; amountMillimes: number }
  | { ok: false; error: WalletActionError };

/** Safe to retry: the client sends the same `id` again. */
export async function checkInAction(input: unknown): Promise<CheckInActionResult> {
  return runWalletAction<CheckInInput, CheckInActionResult>(
    "check_in",
    checkInSchema,
    input,
    async (db, userId, data) => {
      const result = await saveCheckIn(db, userId, data, todayInTunis());
      switch (result.status) {
        case "saved":
          return {
            ok: true,
            kind: result.kind,
            amountMillimes: result.amountMillimes,
            since: result.since?.toISOString() ?? null,
            nextWeek: result.nextWeek,
          };
        case "needs-answer":
          return { ok: false, error: "needs-answer", amountMillimes: result.amountMillimes };
        case "changed":
          return {
            ok: false,
            error: "changed",
            kind: result.kind,
            amountMillimes: result.amountMillimes,
          };
        case "not-found":
          return { ok: false, error: "not-found" };
      }
    },
  );
}

export async function undoCheckInAction(input: unknown): Promise<WalletActionResult> {
  return runWalletAction("undo_check_in", checkInIdSchema, input, async (db, userId, data) => {
    const result = await undoCheckIn(db, userId, data.id, todayInTunis());
    return result === "done" ? ok : fail(result);
  });
}

export async function categorizeUnloggedAction(input: unknown): Promise<WalletActionResult> {
  return runWalletAction(
    "categorize_unlogged",
    categorizeUnloggedSchema,
    input,
    async (db, userId, data) => {
      const result = await categorizeUnlogged(db, userId, data);
      return result === "saved" ? ok : fail(result);
    },
  );
}
