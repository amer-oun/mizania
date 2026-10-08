import type { OnboardingPlan } from "@mizania/core";
import { and, eq, inArray, isNull } from "drizzle-orm";

import type { Db } from "../client";
import { categories, cycles, planItems, transactions, users, wallets } from "../schema";

export type SaveOnboardingResult = "saved" | "already-onboarded";

/**
 * Writes a planned onboarding for `userId` in one transaction: the user's
 * answers, the wallets, their starting balances (adjustments), the first
 * cycle and its fixed costs. Either everything is saved or nothing is.
 *
 * Safe to retry: the user's row is locked first, and once `onboarded_at` is
 * set a second call (double tap, lost response, two tabs) changes nothing.
 * `userId` must come from the session, never from the request body.
 */
export async function saveOnboarding(
  db: Db,
  userId: string,
  plan: OnboardingPlan,
  now: Date = new Date(),
): Promise<SaveOnboardingResult> {
  return db.transaction(async (tx) => {
    const [user] = await tx
      .select({ onboardedAt: users.onboardedAt, weeklyMode: users.weeklyMode })
      .from(users)
      .where(eq(users.id, userId))
      .for("update");
    if (!user) throw new Error("saveOnboarding: user not found");
    if (user.onboardedAt) return "already-onboarded";

    await tx
      .update(users)
      .set({ ...plan.user, onboardedAt: now })
      .where(eq(users.id, userId));

    const [cycle] = await tx
      .insert(cycles)
      .values({ userId, ...plan.cycle, weeklyMode: user.weeklyMode })
      .returning({ id: cycles.id });
    if (!cycle) throw new Error("saveOnboarding: cycle not created");

    const created = await tx
      .insert(wallets)
      .values(
        plan.wallets.map((w) => ({ userId, type: w.kind, name: w.name, position: w.position })),
      )
      .returning({ id: wallets.id, position: wallets.position });
    const walletIdAt = (index: number) => {
      const position = plan.wallets[index]?.position;
      const wallet = created.find((w) => w.position === position);
      if (!wallet) throw new Error(`saveOnboarding: no wallet at index ${index}`);
      return wallet.id;
    };

    if (plan.startingBalances.length > 0) {
      await tx.insert(transactions).values(
        plan.startingBalances.map((b) => ({
          userId,
          cycleId: cycle.id,
          walletId: walletIdAt(b.walletIndex),
          type: "adjustment" as const,
          amountMillimes: b.amountMillimes,
          occurredAt: now,
          source: "manual" as const,
        })),
      );
    }

    if (plan.fixedCosts.length > 0) {
      const keys = plan.fixedCosts.map((c) => c.categoryKey);
      const defaults = await tx
        .select({ id: categories.id, key: categories.key })
        .from(categories)
        .where(and(isNull(categories.userId), inArray(categories.key, keys)));
      await tx.insert(planItems).values(
        plan.fixedCosts.map((cost) => {
          const category = defaults.find((c) => c.key === cost.categoryKey);
          if (!category) {
            throw new Error(`saveOnboarding: default category "${cost.categoryKey}" is missing`);
          }
          return {
            cycleId: cycle.id,
            kind: "fixed" as const,
            categoryId: category.id,
            amountMillimes: cost.amountMillimes,
            paidAt: cost.paid ? now : null,
          };
        }),
      );
    }

    return "saved";
  });
}
