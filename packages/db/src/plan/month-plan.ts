import {
  applyPlanDraft,
  checkPlanChange,
  cycleSummary,
  type CycleSummaryInput,
  type IsoDate,
  type PlanDraftItem,
  suggestGroceries,
  weekAfterPlanChange,
  weekStartAllowance,
} from "@mizania/core";
import { and, asc, eq, inArray, isNull, or, sql } from "drizzle-orm";

import { budgetInput, getBudget, loadCycleData } from "../budget/budget";
import type { Db } from "../client";
import { categories, type CategoryNames, cycles, planItems, weekSnapshots } from "../schema";
import { type Plan, planOf } from "./fixed-costs";

// Editing the month plan: fixed costs, envelopes and one savings line. Every
// function takes the user's ID from the session and scopes every query by
// it. What can change, and how far, is checked by packages/core
// (checkPlanChange): a plan change never rewrites past days.

/** A category that can be added to the plan. */
export interface PlanCategory {
  id: string;
  key: string;
  group: "fixed" | "envelope";
  names: CategoryNames;
  icon: string;
}

export interface PlanEditor {
  cycleId: string;
  weeklyMode: boolean;
  /** Weekly mode: this week's stored amount. */
  weekAllowance: number | undefined;
  /** What the live preview computes from (packages/core previewPlan). */
  input: CycleSummaryInput;
  plan: Plan;
  /** Fixed-cost and envelope categories, in the seed's order. */
  categories: PlanCategory[];
  /** The groceries envelope to suggest while the plan has none. */
  groceries: { categoryId: string; suggested: number } | null;
}

/** Everything the plan editor needs, or null without an active cycle. */
export async function getPlanEditor(
  db: Db,
  userId: string,
  today: IsoDate,
): Promise<PlanEditor | null> {
  const budget = await getBudget(db, userId, today);
  if (!budget) return null;
  const plan = await planOf(db, userId, budget);

  const options = await db
    .select({
      id: categories.id,
      key: categories.key,
      group: categories.group,
      names: categories.names,
      icon: categories.icon,
    })
    .from(categories)
    .where(
      and(
        or(isNull(categories.userId), eq(categories.userId, userId)),
        isNull(categories.deletedAt),
        inArray(categories.group, ["fixed", "envelope"]),
      ),
    )
    .orderBy(asc(categories.position), asc(categories.key));
  const planned = (categoryId: string) =>
    budget.input.planItems.some((i) => i.categoryId === categoryId);
  const groceriesCategory = options.find((c) => c.key === "groceries");
  const suggested =
    groceriesCategory && !planned(groceriesCategory.id)
      ? suggestGroceries(budget.input, groceriesCategory.id)
      : null;

  return {
    cycleId: budget.cycle.id,
    weeklyMode: budget.cycle.weeklyMode,
    weekAllowance: budget.today.week?.allowance,
    input: budget.input,
    plan,
    categories: options.flatMap((c) =>
      c.group === "fixed" || c.group === "envelope" ? [{ ...c, group: c.group }] : [],
    ),
    groceries:
      groceriesCategory && suggested !== null
        ? { categoryId: groceriesCategory.id, suggested }
        : null,
  };
}

export type SavePlanResult = "saved" | "not-found" | "invalid";

/**
 * Saves the whole plan of the user's active cycle `cycleId`: new items are
 * added, changed amounts updated, and items left out removed (a soft
 * delete). New envelopes cover spending from `now`. Refused ("invalid") when
 * packages/core's checkPlanChange refuses it, or a new item's category isn't
 * of its kind.
 *
 * In weekly mode, this week's amount keeps the lower of what it was and what
 * the new plan gives (ADR 006 §4): a bigger plan lowers it at once, a
 * smaller one shows from next week.
 *
 * Safe to retry: new items' IDs come from the client, so saving the same
 * plan again changes nothing.
 */
export async function savePlan(
  db: Db,
  userId: string,
  input: { cycleId: string; items: PlanDraftItem[] },
  today: IsoDate,
  now: Date = new Date(),
): Promise<SavePlanResult> {
  return db.transaction(async (tx) => {
    const [cycle] = await tx
      .select({
        id: cycles.id,
        startedOn: cycles.startedOn,
        expectedNextOn: cycles.expectedNextOn,
        weeklyMode: cycles.weeklyMode,
      })
      .from(cycles)
      .where(
        and(
          eq(cycles.id, input.cycleId),
          eq(cycles.userId, userId),
          eq(cycles.status, "active"),
          isNull(cycles.deletedAt),
        ),
      )
      .for("update");
    if (!cycle) return "not-found";

    const { input: data } = await loadCycleData(tx, userId, cycle, today);
    const summary = cycleSummary(data);
    if (checkPlanChange(summary, data.planItems, input.items)) return "invalid";

    const current = new Map(data.planItems.map((i) => [i.id, i]));
    const added = input.items.filter((i) => !current.has(i.id));
    if (added.length > 0) {
      // A new item's ID must be new: another user's, or a removed item's, is refused.
      const taken = await tx
        .select({ id: planItems.id })
        .from(planItems)
        .where(
          inArray(
            planItems.id,
            added.map((i) => i.id),
          ),
        );
      if (taken.length > 0) return "not-found";

      const categoryIds = added.flatMap((i) => (i.categoryId ? [i.categoryId] : []));
      const groups =
        categoryIds.length === 0
          ? []
          : await tx
              .select({ id: categories.id, group: categories.group })
              .from(categories)
              .where(
                and(
                  inArray(categories.id, categoryIds),
                  or(isNull(categories.userId), eq(categories.userId, userId)),
                  isNull(categories.deletedAt),
                ),
              );
      const ofItsKind = added.every(
        (i) =>
          i.kind === "savings" || groups.some((c) => c.id === i.categoryId && c.group === i.kind),
      );
      if (!ofItsKind) return "invalid";

      await tx.insert(planItems).values(
        added.map((i) => ({
          id: i.id,
          cycleId: cycle.id,
          kind: i.kind,
          categoryId: i.categoryId,
          amountMillimes: i.amountMillimes,
          coversFrom: now,
        })),
      );
    }

    for (const item of input.items) {
      const was = current.get(item.id);
      if (was && was.amountMillimes !== item.amountMillimes) {
        await tx
          .update(planItems)
          .set({ amountMillimes: item.amountMillimes })
          .where(and(eq(planItems.id, item.id), eq(planItems.cycleId, cycle.id)));
      }
    }
    const kept = new Set(input.items.map((i) => i.id));
    const removed = data.planItems.filter((i) => !kept.has(i.id)).map((i) => i.id);
    if (removed.length > 0) {
      await tx
        .update(planItems)
        .set({ deletedAt: now })
        .where(and(inArray(planItems.id, removed), eq(planItems.cycleId, cycle.id)));
    }

    if (cycle.weeklyMode) {
      const before = budgetInput(data, summary);
      const after = budgetInput(
        data,
        cycleSummary({
          ...data,
          planItems: applyPlanDraft(data.planItems, input.items, now.getTime()),
        }),
      );
      const week = weekStartAllowance(before);
      const [stored] = await tx
        .select({ allowance: weekSnapshots.allowanceMillimes })
        .from(weekSnapshots)
        .where(
          and(
            eq(weekSnapshots.userId, userId),
            eq(weekSnapshots.cycleId, cycle.id),
            eq(weekSnapshots.weekIndex, week.index),
          ),
        );
      const allowance = weekAfterPlanChange(stored?.allowance ?? week.allowance, after);
      // A snapshot stored meanwhile from the old plan keeps the lower amount too.
      await tx
        .insert(weekSnapshots)
        .values({
          userId,
          cycleId: cycle.id,
          weekIndex: week.index,
          startsOn: week.start,
          endsOn: week.end,
          allowanceMillimes: allowance,
        })
        .onConflictDoUpdate({
          target: [weekSnapshots.cycleId, weekSnapshots.weekIndex],
          set: {
            allowanceMillimes: sql`least(${weekSnapshots.allowanceMillimes}, excluded.allowance_millimes)`,
          },
        });
    }
    return "saved";
  });
}
