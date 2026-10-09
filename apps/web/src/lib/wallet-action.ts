import { logger } from "@mizania/auth";
import type { Db } from "@mizania/db/client";
import { headers } from "next/headers";

import { getAuth } from "@/lib/auth";
import { getDb } from "@/lib/db";

// Shared by the wallet and transfer server actions. Server-only.

export type WalletActionError =
  | "signed-out"
  | "invalid"
  | "not-found"
  | "type-taken"
  | "last-wallet"
  | "wallet-archived"
  | "server";
export type WalletActionResult = { ok: true } | { ok: false; error: WalletActionError };

interface Schema<T> {
  safeParse(input: unknown): { success: true; data: T } | { success: false };
}

export const ok: WalletActionResult = { ok: true };
export const fail = (error: WalletActionError): WalletActionResult => ({ ok: false, error });

/**
 * Checks the session and the input, then runs `change` for the signed-in
 * user. The user ID always comes from the session, never from the input.
 */
export async function runWalletAction<T>(
  name: string,
  schema: Schema<T>,
  input: unknown,
  change: (db: Db, userId: string, data: T) => Promise<WalletActionResult>,
): Promise<WalletActionResult> {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return fail("signed-out");

  const parsed = schema.safeParse(input);
  if (!parsed.success) return fail("invalid");

  try {
    return await change(getDb(), session.user.id, parsed.data);
  } catch (error) {
    logger.error(
      { event: `${name}_failed`, userId: session.user.id, err: error },
      `${name} failed`,
    );
    return fail("server");
  }
}
