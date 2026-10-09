import type { EnvelopeStatus, FixedCostStatus, IsoDate } from "@mizania/core";
import { and, asc, desc, eq, isNull } from "drizzle-orm";

import { getBudget } from "../budget/budget";
import type { Db } from "../client";
import {
  categories,
  type CategoryNames,
  cycles,
  planItems,
  transactions,
  wallets,
} from "../schema";

// The plan of the active cycle, and paying its fixed costs. Every function
// takes the user's ID from the session and scopes every query by it: another
// user's plan item or wallet gets the same "not-found" as one that doesn't
// exist. Payments are expenses with source "plan", linked to their plan item.

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

interface Named {
  /** Null for a plan item named by the student instead of a category. */
  categoryKey: string | null;
  names: CategoryNames | null;
  name: string | null;
  icon: string | null;
}

export interface PlanFixedCost extends FixedCostStatus, Named {
  /** When it was marked paid. */
  paidAt: Date | null;
  /** The wallet of its latest payment, to preselect next time. */
  lastWalletId: string | null;
}

export interface PlanEnvelope extends EnvelopeStatus, Named {}

export interface Plan {
  cycle: { startedOn: IsoDate; expectedNextOn: IsoDate };
  fixedCosts: PlanFixedCost[];
  envelopes: PlanEnvelope[];
  /** Everything still set aside for fixed costs (the Today breakdown's line). */
  stillToPay: number;
}

/** The active cycle's plan with what's paid and left (from packages/core), or null. */
export async function getPlan(db: Db, userId: string, today: IsoDate): Promise<Plan | null> {
  const budget = await getBudget(db, userId, today);
  if (!budget) return null;

  const items = await db
    .select({
      id: planItems.id,
      kind: planItems.kind,
      categoryId: planItems.categoryId,
      name: planItems.name,
      paidAt: planItems.paidAt,
      categoryKey: categories.key,
      names: categories.names,
      icon: categories.icon,
    })
    .from(planItems)
    .leftJoin(categories, eq(categories.id, planItems.categoryId))
    .where(and(eq(planItems.cycleId, budget.cycle.id), isNull(planItems.deletedAt)))
    .orderBy(asc(planItems.createdAt), asc(planItems.id));
  const payments = await db
    .select({ planItemId: transactions.planItemId, walletId: transactions.walletId })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, userId),
        eq(transactions.source, "plan"),
        isNull(transactions.deletedAt),
      ),
    )
    .orderBy(desc(transactions.occurredAt), desc(transactions.createdAt));

  const named = (item: (typeof items)[number] | undefined): Named => ({
    categoryKey: item?.categoryKey ?? null,
    names: item?.names ?? null,
    name: item?.name ?? null,
    icon: item?.icon ?? null,
  });

  return {
    cycle: { startedOn: budget.cycle.startedOn, expectedNextOn: budget.cycle.expectedNextOn },
    fixedCosts: budget.summary.fixedCosts.map((status) => {
      const item = items.find((i) => i.id === status.id);
      return {
        ...status,
        ...named(item),
        paidAt: item?.paidAt ?? null,
        lastWalletId: payments.find((p) => p.planItemId === status.id)?.walletId ?? null,
      };
    }),
    envelopes: budget.summary.envelopes.map((status) => ({
      ...status,
      ...named(
        status.categoryId === null
          ? undefined
          : items.find((i) => i.kind === "envelope" && i.categoryId === status.categoryId),
      ),
    })),
    stillToPay: budget.summary.reserved.fixed,
  };
}

/** A fixed cost of the user's active cycle, locked until the transaction ends. */
async function lockFixedCost(tx: Tx, userId: string, planItemId: string) {
  const [item] = await tx
    .select({
      id: planItems.id,
      cycleId: planItems.cycleId,
      categoryId: planItems.categoryId,
      paidAt: planItems.paidAt,
    })
    .from(planItems)
    .innerJoin(cycles, eq(cycles.id, planItems.cycleId))
    .where(
      and(
        eq(planItems.id, planItemId),
        eq(planItems.kind, "fixed"),
        isNull(planItems.deletedAt),
        eq(cycles.userId, userId),
        eq(cycles.status, "active"),
        isNull(cycles.deletedAt),
      ),
    )
    .for("update", { of: planItems });
  return item;
}

export type PayFixedCostResult = "saved" | "not-found" | "already-paid";

/**
 * Records a payment of a fixed cost from one of the user's active wallets,
 * now. `final` ("that's everything for this month") marks it paid; without
 * it the cost stays partly paid and only what's left stays set aside.
 *
 * Safe to retry: `id` comes from the client, and a second call with the same
 * ID saves nothing more.
 */
export async function payFixedCost(
  db: Db,
  userId: string,
  input: {
    id: string;
    planItemId: string;
    amountMillimes: number;
    walletId: string;
    final: boolean;
  },
  now: Date = new Date(),
): Promise<PayFixedCostResult> {
  return db.transaction(async (tx) => {
    const item = await lockFixedCost(tx, userId, input.planItemId);
    if (!item) return "not-found";

    // A retry of this user's payment is fine; another user's ID is refused.
    const [existing] = await tx
      .select({ userId: transactions.userId, planItemId: transactions.planItemId })
      .from(transactions)
      .where(eq(transactions.id, input.id));
    if (existing) {
      return existing.userId === userId && existing.planItemId === item.id ? "saved" : "not-found";
    }
    if (item.paidAt) return "already-paid";

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
    if (!wallet) return "not-found";

    await tx.insert(transactions).values({
      id: input.id,
      userId,
      cycleId: item.cycleId,
      walletId: wallet.id,
      categoryId: item.categoryId,
      planItemId: item.id,
      type: "expense",
      amountMillimes: input.amountMillimes,
      occurredAt: now,
      source: "plan",
    });
    if (input.final) {
      await tx.update(planItems).set({ paidAt: now }).where(eq(planItems.id, item.id));
    }
    return "saved";
  });
}

export type MarkFixedCostPaidResult = "done" | "not-found";

/** "That's everything for this month" without another payment. */
export async function markFixedCostPaid(
  db: Db,
  userId: string,
  planItemId: string,
  now: Date = new Date(),
): Promise<MarkFixedCostPaidResult> {
  return db.transaction(async (tx) => {
    const item = await lockFixedCost(tx, userId, planItemId);
    if (!item) return "not-found";
    if (!item.paidAt) {
      await tx.update(planItems).set({ paidAt: now }).where(eq(planItems.id, item.id));
    }
    return "done";
  });
}

export type UndoFixedCostPaymentResult = "done" | "not-found" | "wallet-archived";

/**
 * Undoes the latest payment of a fixed cost (a soft delete) and marks it
 * unpaid again, so its amount is set aside again. A cost marked "already
 * paid" during onboarding has no payment: it's only marked unpaid. Refused
 * when the payment's wallet is archived, since it must stay at 0.
 */
export async function undoFixedCostPayment(
  db: Db,
  userId: string,
  planItemId: string,
  now: Date = new Date(),
): Promise<UndoFixedCostPaymentResult> {
  return db.transaction(async (tx) => {
    const item = await lockFixedCost(tx, userId, planItemId);
    if (!item) return "not-found";

    const [payment] = await tx
      .select({ id: transactions.id, archived: wallets.archived })
      .from(transactions)
      .innerJoin(wallets, eq(wallets.id, transactions.walletId))
      .where(
        and(
          eq(transactions.userId, userId),
          eq(transactions.planItemId, item.id),
          eq(transactions.source, "plan"),
          isNull(transactions.deletedAt),
        ),
      )
      .orderBy(desc(transactions.occurredAt), desc(transactions.createdAt))
      .limit(1);
    if (payment?.archived) return "wallet-archived";
    if (payment) {
      await tx
        .update(transactions)
        .set({ deletedAt: now })
        .where(and(eq(transactions.id, payment.id), eq(transactions.userId, userId)));
    }
    await tx.update(planItems).set({ paidAt: null }).where(eq(planItems.id, item.id));
    return "done";
  });
}
