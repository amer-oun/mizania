import {
  type ArchiveChoice,
  archiveSettlement,
  type BalanceTransaction,
  walletBalances,
  type WalletKind,
} from "@mizania/core";
import { and, asc, desc, eq, isNull, max } from "drizzle-orm";

import type { Db } from "../client";
import { cycles, transactions, wallets } from "../schema";

// Wallets and transfers. Every function takes the user's ID from the session
// and scopes every query by it: another user's wallet or transfer ID gets
// the same "not-found" as an ID that doesn't exist.

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Queryable = Db | Tx;

export interface WalletWithBalance {
  id: string;
  type: WalletKind;
  /** Only for "other" wallets; the others are named from their type. */
  name: string | null;
  archived: boolean;
  position: number;
  balanceMillimes: number;
}

export interface TransferRow {
  id: string;
  fromWalletId: string;
  toWalletId: string;
  amountMillimes: number;
  note: string | null;
  occurredAt: Date;
}

export interface WalletsOverview {
  /** Active wallets by position, then archived ones. */
  wallets: WalletWithBalance[];
  /** The latest transfers that aren't undone, newest first. */
  recentTransfers: TransferRow[];
}

const RECENT_TRANSFERS = 10;

/** Balances of all the user's wallets, from their transactions that aren't deleted. */
async function balancesOf(db: Queryable, userId: string) {
  // Every wallet, even deleted ones, so that each transaction finds its wallets.
  const ids = await db.select({ id: wallets.id }).from(wallets).where(eq(wallets.userId, userId));
  const rows = await db
    .select({
      type: transactions.type,
      walletId: transactions.walletId,
      toWalletId: transactions.toWalletId,
      amountMillimes: transactions.amountMillimes,
    })
    .from(transactions)
    .where(and(eq(transactions.userId, userId), isNull(transactions.deletedAt)));
  return walletBalances(
    ids.map((w) => w.id),
    rows satisfies BalanceTransaction[],
  );
}

/** The user's wallets that aren't deleted, locked until the transaction ends. */
function lockWallets(tx: Tx, userId: string) {
  return tx
    .select({ id: wallets.id, archived: wallets.archived, position: wallets.position })
    .from(wallets)
    .where(and(eq(wallets.userId, userId), isNull(wallets.deletedAt)))
    .orderBy(asc(wallets.position), asc(wallets.createdAt))
    .for("update");
}

async function activeCycleId(tx: Tx, userId: string): Promise<string | null> {
  const [cycle] = await tx
    .select({ id: cycles.id })
    .from(cycles)
    .where(and(eq(cycles.userId, userId), eq(cycles.status, "active"), isNull(cycles.deletedAt)));
  return cycle?.id ?? null;
}

async function nextPosition(tx: Tx, userId: string): Promise<number> {
  const [row] = await tx
    .select({ last: max(wallets.position) })
    .from(wallets)
    .where(and(eq(wallets.userId, userId), eq(wallets.archived, false), isNull(wallets.deletedAt)));
  return (row?.last ?? -1) + 1;
}

export async function getWalletsOverview(db: Db, userId: string): Promise<WalletsOverview> {
  const rows = await db
    .select({
      id: wallets.id,
      type: wallets.type,
      name: wallets.name,
      archived: wallets.archived,
      position: wallets.position,
    })
    .from(wallets)
    .where(and(eq(wallets.userId, userId), isNull(wallets.deletedAt)))
    .orderBy(asc(wallets.archived), asc(wallets.position), asc(wallets.createdAt));
  const balances = await balancesOf(db, userId);

  const transfers = await db
    .select({
      id: transactions.id,
      fromWalletId: transactions.walletId,
      toWalletId: transactions.toWalletId,
      amountMillimes: transactions.amountMillimes,
      note: transactions.note,
      occurredAt: transactions.occurredAt,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, userId),
        eq(transactions.type, "transfer"),
        isNull(transactions.deletedAt),
      ),
    )
    .orderBy(desc(transactions.occurredAt), desc(transactions.createdAt))
    .limit(RECENT_TRANSFERS);

  return {
    wallets: rows.map((w) => ({ ...w, balanceMillimes: balances.get(w.id) ?? 0 })),
    recentTransfers: transfers.flatMap((t) =>
      t.toWalletId === null ? [] : [{ ...t, toWalletId: t.toWalletId }],
    ),
  };
}

export type AddWalletResult = { status: "added"; walletId: string } | { status: "type-taken" };

/**
 * Adds a wallet at the end of the list, with its starting balance as an
 * adjustment. Cash, D17, Flouci and card exist once per user (an archived
 * one is restored instead); "other" wallets can repeat.
 */
export async function addWallet(
  db: Db,
  userId: string,
  input: { kind: WalletKind; name: string | null; balanceMillimes: number },
  now: Date = new Date(),
): Promise<AddWalletResult> {
  return db.transaction(async (tx) => {
    await lockWallets(tx, userId);
    const name = input.kind === "other" ? input.name : null;
    if (input.kind !== "other") {
      const [taken] = await tx
        .select({ id: wallets.id })
        .from(wallets)
        .where(
          and(eq(wallets.userId, userId), eq(wallets.type, input.kind), isNull(wallets.deletedAt)),
        );
      if (taken) return { status: "type-taken" };
    }

    const [wallet] = await tx
      .insert(wallets)
      .values({ userId, type: input.kind, name, position: await nextPosition(tx, userId) })
      .returning({ id: wallets.id });
    if (!wallet) throw new Error("addWallet: wallet not created");

    if (input.balanceMillimes !== 0) {
      await tx.insert(transactions).values({
        userId,
        cycleId: await activeCycleId(tx, userId),
        walletId: wallet.id,
        type: "adjustment",
        amountMillimes: input.balanceMillimes,
        occurredAt: now,
        source: "manual",
      });
    }
    return { status: "added", walletId: wallet.id };
  });
}

export type RenameWalletResult = "renamed" | "not-found" | "not-other";

/** Renames an "other" wallet; the others are named from their type. */
export async function renameWallet(
  db: Db,
  userId: string,
  walletId: string,
  name: string,
): Promise<RenameWalletResult> {
  const [wallet] = await db
    .select({ type: wallets.type })
    .from(wallets)
    .where(and(eq(wallets.id, walletId), eq(wallets.userId, userId), isNull(wallets.deletedAt)));
  if (!wallet) return "not-found";
  if (wallet.type !== "other") return "not-other";
  await db
    .update(wallets)
    .set({ name })
    .where(and(eq(wallets.id, walletId), eq(wallets.userId, userId)));
  return "renamed";
}

export type MoveWalletResult = "moved" | "not-found";

/**
 * Moves an active wallet one place up or down (nothing happens at either
 * end) and numbers the active wallets 0, 1, 2… again.
 */
export async function moveWallet(
  db: Db,
  userId: string,
  walletId: string,
  direction: "up" | "down",
): Promise<MoveWalletResult> {
  return db.transaction(async (tx) => {
    const active = (await lockWallets(tx, userId)).filter((w) => !w.archived);
    const from = active.findIndex((w) => w.id === walletId);
    if (from === -1) return "not-found";

    const order = active.map((w) => w.id);
    const to = direction === "up" ? from - 1 : from + 1;
    if (to >= 0 && to < order.length) {
      order.splice(from, 1);
      order.splice(to, 0, walletId);
    }

    for (const [position, id] of order.entries()) {
      if (active.find((w) => w.id === id)?.position === position) continue;
      await tx
        .update(wallets)
        .set({ position })
        .where(and(eq(wallets.id, id), eq(wallets.userId, userId)));
    }
    return "moved";
  });
}

export type ArchiveWalletResult = "archived" | "not-found" | "last-wallet";

/**
 * Archives an active wallet. An archived wallet is always at 0: a non-zero
 * balance is first moved to another active wallet or zeroed with an
 * adjustment, in the same transaction. The last active wallet stays.
 */
export async function archiveWallet(
  db: Db,
  userId: string,
  walletId: string,
  choice: ArchiveChoice,
  now: Date = new Date(),
): Promise<ArchiveWalletResult> {
  return db.transaction(async (tx) => {
    const all = await lockWallets(tx, userId);
    const active = all.filter((w) => !w.archived);
    if (!active.some((w) => w.id === walletId)) return "not-found";
    if (choice.kind === "move" && !active.some((w) => w.id === choice.toWalletId)) {
      return "not-found";
    }
    if (active.length === 1) return "last-wallet";

    const balances = await balancesOf(tx, userId);
    const settlement = archiveSettlement(walletId, balances.get(walletId) ?? 0, choice);
    if (settlement) {
      await tx.insert(transactions).values({
        ...settlement,
        userId,
        cycleId: await activeCycleId(tx, userId),
        occurredAt: now,
        source: "manual",
      });
    }
    await tx
      .update(wallets)
      .set({ archived: true })
      .where(and(eq(wallets.id, walletId), eq(wallets.userId, userId)));
    return "archived";
  });
}

export type RestoreWalletResult = "restored" | "not-found";

/** Brings an archived wallet back, at the end of the list, at 0. */
export async function restoreWallet(
  db: Db,
  userId: string,
  walletId: string,
): Promise<RestoreWalletResult> {
  return db.transaction(async (tx) => {
    const all = await lockWallets(tx, userId);
    if (!all.some((w) => w.id === walletId && w.archived)) return "not-found";
    await tx
      .update(wallets)
      .set({ archived: false, position: await nextPosition(tx, userId) })
      .where(and(eq(wallets.id, walletId), eq(wallets.userId, userId)));
    return "restored";
  });
}

export type TransferResult = "saved" | "not-found";

/**
 * Records a transfer between two of the user's active wallets, for example
 * a cash withdrawal from the card. It may leave the source below 0: balances
 * are typed in by hand, and the evening check-in corrects them.
 *
 * Safe to retry: `id` comes from the client, and a second call with the same
 * ID saves nothing more.
 */
export async function transfer(
  db: Db,
  userId: string,
  input: {
    id: string;
    fromWalletId: string;
    toWalletId: string;
    amountMillimes: number;
    note: string | null;
  },
  now: Date = new Date(),
): Promise<TransferResult> {
  return db.transaction(async (tx) => {
    const active = (await lockWallets(tx, userId)).filter((w) => !w.archived);
    const own = (id: string) => active.some((w) => w.id === id);
    if (!own(input.fromWalletId) || !own(input.toWalletId)) return "not-found";

    const inserted = await tx
      .insert(transactions)
      .values({
        id: input.id,
        userId,
        cycleId: await activeCycleId(tx, userId),
        walletId: input.fromWalletId,
        toWalletId: input.toWalletId,
        type: "transfer",
        amountMillimes: input.amountMillimes,
        note: input.note,
        occurredAt: now,
        source: "manual",
      })
      .onConflictDoNothing({ target: transactions.id })
      .returning({ id: transactions.id });
    if (inserted.length > 0) return "saved";

    // The ID exists: a retry of this user's transfer is fine; anything else
    // (another user's ID) is refused without saying more.
    const [existing] = await tx
      .select({ id: transactions.id })
      .from(transactions)
      .where(
        and(
          eq(transactions.id, input.id),
          eq(transactions.userId, userId),
          eq(transactions.type, "transfer"),
        ),
      );
    return existing ? "saved" : "not-found";
  });
}

export type UndoTransferResult = "undone" | "not-found" | "wallet-archived";

/**
 * Undoes a transfer by soft-deleting it (never a hard delete). Refused when
 * either wallet is archived, since an archived wallet must stay at 0.
 */
export async function undoTransfer(
  db: Db,
  userId: string,
  transferId: string,
  now: Date = new Date(),
): Promise<UndoTransferResult> {
  return db.transaction(async (tx) => {
    const all = await lockWallets(tx, userId);
    const [row] = await tx
      .select({
        walletId: transactions.walletId,
        toWalletId: transactions.toWalletId,
        deletedAt: transactions.deletedAt,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.id, transferId),
          eq(transactions.userId, userId),
          eq(transactions.type, "transfer"),
        ),
      );
    if (!row) return "not-found";
    if (row.deletedAt) return "undone";

    const archived = all.filter((w) => w.archived).map((w) => w.id);
    if (archived.includes(row.walletId) || (row.toWalletId && archived.includes(row.toWalletId))) {
      return "wallet-archived";
    }
    await tx
      .update(transactions)
      .set({ deletedAt: now })
      .where(
        and(
          eq(transactions.id, transferId),
          eq(transactions.userId, userId),
          eq(transactions.type, "transfer"),
        ),
      );
    return "undone";
  });
}
