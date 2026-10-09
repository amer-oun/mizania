import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";

import type { Db } from "../client";
import {
  categories,
  type CategoryNames,
  cycles,
  planItems,
  transactions,
  wallets,
  type WalletType,
} from "../schema";

// Quick log: expenses typed in by the student. Every function takes the
// user's ID from the session and scopes every query by it: another user's
// wallet, category or expense gets the same "not-found" as one that doesn't
// exist.

export interface CategoryOption {
  id: string;
  key: string;
  names: CategoryNames;
  /** A lucide-react icon name. */
  icon: string;
  group: "fixed" | "envelope" | "daily" | "income";
}

/** The default categories and the user's own, in their usual order. */
export function getCategories(db: Db, userId: string): Promise<CategoryOption[]> {
  return db
    .select({
      id: categories.id,
      key: categories.key,
      names: categories.names,
      icon: categories.icon,
      group: categories.group,
    })
    .from(categories)
    .where(
      and(
        or(isNull(categories.userId), eq(categories.userId, userId)),
        isNull(categories.deletedAt),
      ),
    )
    .orderBy(asc(categories.position), asc(categories.createdAt));
}

export interface QuickLogOptions {
  /**
   * What quick log offers: daily and envelope categories (never fixed costs,
   * which are paid through "Mark paid"), most used in the last 30 days
   * first, then in their usual order.
   */
  categories: (CategoryOption & {
    /** In this month's plan as an envelope: spending in it doesn't lower today's money. */
    envelope: boolean;
    /** The active wallet last used for it, to preselect. */
    lastWalletId: string | null;
  })[];
  wallets: { id: string; type: WalletType; name: string | null }[];
  /** Cash if it's active, else the first wallet. */
  defaultWalletId: string | null;
}

const QUICK_LOG_GROUPS = ["daily", "envelope"] as const;
const USAGE_DAYS = 30;

export async function getQuickLogOptions(
  db: Db,
  userId: string,
  now: Date = new Date(),
): Promise<QuickLogOptions> {
  const active = await db
    .select({ id: wallets.id, type: wallets.type, name: wallets.name })
    .from(wallets)
    .where(and(eq(wallets.userId, userId), eq(wallets.archived, false), isNull(wallets.deletedAt)))
    .orderBy(asc(wallets.position), asc(wallets.createdAt));
  const activeIds = new Set(active.map((w) => w.id));

  const offered = (await getCategories(db, userId)).filter((c) =>
    (QUICK_LOG_GROUPS as readonly string[]).includes(c.group),
  );

  const since = new Date(now.getTime() - USAGE_DAYS * 24 * 60 * 60 * 1000);
  const usage = await db
    .select({ categoryId: transactions.categoryId, uses: sql<number>`count(*)::int` })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, userId),
        eq(transactions.type, "expense"),
        isNull(transactions.deletedAt),
        isNotNull(transactions.categoryId),
        gte(transactions.occurredAt, since),
      ),
    )
    .groupBy(transactions.categoryId);
  const usesOf = new Map(usage.map((u) => [u.categoryId, u.uses]));

  // The wallet of the latest expense in each category.
  const latest = await db
    .selectDistinctOn([transactions.categoryId], {
      categoryId: transactions.categoryId,
      walletId: transactions.walletId,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, userId),
        eq(transactions.type, "expense"),
        isNull(transactions.deletedAt),
        isNotNull(transactions.categoryId),
      ),
    )
    .orderBy(transactions.categoryId, desc(transactions.occurredAt), desc(transactions.createdAt));
  const lastWalletOf = new Map(latest.map((l) => [l.categoryId, l.walletId]));

  const envelopes = await db
    .select({ categoryId: planItems.categoryId })
    .from(planItems)
    .innerJoin(cycles, eq(cycles.id, planItems.cycleId))
    .where(
      and(
        eq(cycles.userId, userId),
        eq(cycles.status, "active"),
        isNull(cycles.deletedAt),
        eq(planItems.kind, "envelope"),
        isNull(planItems.deletedAt),
      ),
    );
  const envelopeIds = new Set(envelopes.map((e) => e.categoryId));

  const withUsage = offered.map((c, order) => ({ c, order, uses: usesOf.get(c.id) ?? 0 }));
  // "Other" always stays last; the rest by use, then in their usual order.
  withUsage.sort(
    (a, b) =>
      Number(a.c.key === "other") - Number(b.c.key === "other") ||
      b.uses - a.uses ||
      a.order - b.order,
  );

  return {
    categories: withUsage.map(({ c }) => {
      const last = lastWalletOf.get(c.id);
      return {
        ...c,
        envelope: envelopeIds.has(c.id),
        lastWalletId: last !== undefined && activeIds.has(last) ? last : null,
      };
    }),
    wallets: active,
    defaultWalletId: (active.find((w) => w.type === "cash") ?? active[0])?.id ?? null,
  };
}

export type LogExpenseResult = "saved" | "not-found";

/**
 * Saves an expense from one of the user's active wallets, in a category quick
 * log offers (a default one or the user's own, not a fixed cost). It happens
 * now, in the active cycle.
 *
 * Safe to retry: `id` comes from the client, and a second call with the same
 * ID saves nothing more.
 */
export async function logExpense(
  db: Db,
  userId: string,
  input: { id: string; amountMillimes: number; categoryId: string; walletId: string },
  now: Date = new Date(),
): Promise<LogExpenseResult> {
  return db.transaction(async (tx) => {
    const [wallet] = await tx
      .select({ id: wallets.id })
      .from(wallets)
      .where(
        and(
          eq(wallets.id, input.walletId),
          eq(wallets.userId, userId),
          eq(wallets.archived, false),
          isNull(wallets.deletedAt),
        ),
      );
    const [category] = await tx
      .select({ id: categories.id })
      .from(categories)
      .where(
        and(
          eq(categories.id, input.categoryId),
          or(isNull(categories.userId), eq(categories.userId, userId)),
          inArray(categories.group, [...QUICK_LOG_GROUPS]),
          isNull(categories.deletedAt),
        ),
      );
    if (!wallet || !category) return "not-found";

    const [cycle] = await tx
      .select({ id: cycles.id })
      .from(cycles)
      .where(and(eq(cycles.userId, userId), eq(cycles.status, "active"), isNull(cycles.deletedAt)));
    const inserted = await tx
      .insert(transactions)
      .values({
        id: input.id,
        userId,
        cycleId: cycle?.id ?? null,
        walletId: wallet.id,
        categoryId: category.id,
        type: "expense",
        amountMillimes: input.amountMillimes,
        occurredAt: now,
        source: "quick",
      })
      .onConflictDoNothing({ target: transactions.id })
      .returning({ id: transactions.id });
    if (inserted.length > 0) return "saved";

    // The ID exists: a retry of this user's expense is fine; anything else
    // (another user's ID) is refused without saying more.
    const [existing] = await tx
      .select({ id: transactions.id })
      .from(transactions)
      .where(
        and(
          eq(transactions.id, input.id),
          eq(transactions.userId, userId),
          eq(transactions.type, "expense"),
        ),
      );
    return existing ? "saved" : "not-found";
  });
}

export type ExpenseChangeResult = "done" | "not-found" | "wallet-archived";

/**
 * Deletes (soft) or brings back a quick-log expense. Refused when its wallet
 * is archived, since an archived wallet must stay at 0. Doing it twice is
 * fine.
 */
async function setExpenseDeleted(
  db: Db,
  userId: string,
  transactionId: string,
  deletedAt: Date | null,
): Promise<ExpenseChangeResult> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ archived: wallets.archived })
      .from(transactions)
      .innerJoin(wallets, eq(wallets.id, transactions.walletId))
      .where(
        and(
          eq(transactions.id, transactionId),
          eq(transactions.userId, userId),
          eq(transactions.type, "expense"),
          eq(transactions.source, "quick"),
        ),
      )
      .for("update");
    if (!row) return "not-found";
    if (row.archived) return "wallet-archived";

    await tx
      .update(transactions)
      .set({ deletedAt })
      .where(and(eq(transactions.id, transactionId), eq(transactions.userId, userId)));
    return "done";
  });
}

export function deleteExpense(
  db: Db,
  userId: string,
  transactionId: string,
  now: Date = new Date(),
): Promise<ExpenseChangeResult> {
  return setExpenseDeleted(db, userId, transactionId, now);
}

export function restoreExpense(
  db: Db,
  userId: string,
  transactionId: string,
): Promise<ExpenseChangeResult> {
  return setExpenseDeleted(db, userId, transactionId, null);
}
