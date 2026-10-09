// Wallet balances (PLAN.md §7). Balances are never stored: each one is
// derived from the wallet's transactions. All amounts are integer millimes.

import { assertMillimes } from "./money";

export type TransactionType = "expense" | "income" | "transfer" | "adjustment";

/** The parts of a transaction that move money between wallets. */
export interface BalanceTransaction {
  type: TransactionType;
  walletId: string;
  /** Transfers only: the wallet the money goes to. */
  toWalletId?: string | null | undefined;
  /** Positive, except adjustments, which are signed (never 0). */
  amountMillimes: number;
}

/** Checks the transaction and returns how it changes each wallet. */
function movements(t: BalanceTransaction, known: ReadonlySet<string>): [string, number][] {
  assertMillimes(t.amountMillimes);
  if (t.type === "adjustment" ? t.amountMillimes === 0 : t.amountMillimes <= 0) {
    throw new RangeError(`Invalid ${t.type} amount: ${t.amountMillimes} millimes.`);
  }
  if (!known.has(t.walletId)) throw new RangeError(`Unknown wallet: ${t.walletId}.`);
  const target = t.toWalletId ?? null;
  if (t.type !== "transfer") {
    if (target !== null) throw new RangeError(`Only a transfer has a target wallet.`);
    return [[t.walletId, t.type === "expense" ? -t.amountMillimes : t.amountMillimes]];
  }
  if (target === null || !known.has(target)) {
    throw new RangeError(`Unknown target wallet: ${String(target)}.`);
  }
  if (target === t.walletId) throw new RangeError(`A transfer needs two wallets.`);
  return [
    [t.walletId, -t.amountMillimes],
    [target, t.amountMillimes],
  ];
}

/**
 * Each wallet's balance: adjustments (signed) + income − expenses − transfers
 * out + transfers in. Wallets without transactions are at 0. Pass only
 * transactions that aren't deleted. Throws on a transaction that mentions a
 * wallet not in `walletIds` or breaks the amount rules.
 */
export function walletBalances(
  walletIds: readonly string[],
  transactions: readonly BalanceTransaction[],
): Map<string, number> {
  const known = new Set(walletIds);
  const sums = new Map<string, number>();
  for (const t of transactions) {
    for (const [walletId, amount] of movements(t, known)) {
      const next = (sums.get(walletId) ?? 0) + amount;
      assertMillimes(next);
      sums.set(walletId, next);
    }
  }
  return new Map(walletIds.map((id) => [id, sums.get(id) ?? 0]));
}

/** The sum of some wallet balances: for active wallets, the money available. */
export function totalBalance(balances: Iterable<number>): number {
  let total = 0;
  for (const balance of balances) {
    assertMillimes(balance);
    total += balance;
    assertMillimes(total);
  }
  return total;
}

/** Both balances once a transfer is saved, for the preview before confirming. */
export function previewTransfer(
  fromBalance: number,
  toBalance: number,
  amountMillimes: number,
): { from: number; to: number } {
  assertMillimes(fromBalance);
  assertMillimes(toBalance);
  assertMillimes(amountMillimes);
  if (amountMillimes <= 0) {
    throw new RangeError(`Invalid transfer amount: ${amountMillimes} millimes.`);
  }
  const from = fromBalance - amountMillimes;
  const to = toBalance + amountMillimes;
  assertMillimes(from);
  assertMillimes(to);
  return { from, to };
}

/** How a student empties a wallet before archiving it. */
export type ArchiveChoice =
  | { kind: "move"; toWalletId: string }
  /** "I don't have this money any more." */
  | { kind: "zero" };

/**
 * The transaction that brings a wallet to 0 so it can be archived, or null if
 * it's already at 0. Moving a negative balance takes the missing money from
 * the other wallet; zeroing records an adjustment.
 */
export function archiveSettlement(
  walletId: string,
  balance: number,
  choice: ArchiveChoice,
): BalanceTransaction | null {
  assertMillimes(balance);
  if (balance === 0) return null;
  if (choice.kind === "zero") {
    return { type: "adjustment", walletId, amountMillimes: -balance };
  }
  if (choice.toWalletId === walletId) throw new RangeError(`A transfer needs two wallets.`);
  return balance > 0
    ? { type: "transfer", walletId, toWalletId: choice.toWalletId, amountMillimes: balance }
    : {
        type: "transfer",
        walletId: choice.toWalletId,
        toWalletId: walletId,
        amountMillimes: -balance,
      };
}
