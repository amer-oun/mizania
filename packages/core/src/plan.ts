// The month plan (ADR 006): what the student can change in it and how far,
// a live preview of today's amount, and the groceries envelope suggestion.
// All amounts are integer millimes.
//
// A plan change never rewrites past days: what was spent from the daily money
// stays spent. So an amount can't go below what's already used of it, an
// overspent item can't change, and a new envelope covers spending only from
// when it's added. With the week rule (weekAfterPlanChange), a plan change can
// never raise this week's amount, or undo an overspent week.

import { daysBetween, daysLeft } from "./cycle";
import { type TodayBudget, todayBudget, type TodayBudgetInput, weekStartAllowance } from "./daily";
import { ceilDiv, floorDiv, mulDivFloor } from "./integer-math";
import { assertMillimes } from "./money";
import {
  type CycleSummary,
  cycleSummary,
  type CycleSummaryInput,
  type EnvelopeStatus,
  type FixedCostStatus,
  type PlanItemKind,
  type SummaryPlanItem,
} from "./summary";
import { totalBalance } from "./wallets";

/** A plan item as the student edits it. */
export interface PlanDraftItem {
  /** Made by the client for a new item, so saving it twice adds it once. */
  id: string;
  kind: PlanItemKind;
  /** Null only for savings. */
  categoryId: string | null;
  /** More than 0. */
  amountMillimes: number;
}

export interface PlanItemLimits {
  /** Can't change: a fixed cost marked paid, or anything already overspent. */
  locked: boolean;
  /** The lowest amount it can change to: what's already used of it. */
  min: number;
  /**
   * Nothing is used of it yet, so it can be removed. An envelope with
   * spending is closed instead: lowered to `min`.
   */
  removable: boolean;
}

export function fixedCostLimits(cost: FixedCostStatus): PlanItemLimits {
  const locked = cost.paid || cost.paidSoFar > cost.planned;
  return { locked, min: cost.paidSoFar, removable: !locked && cost.paidSoFar === 0 };
}

export function envelopeLimits(envelope: EnvelopeStatus): PlanItemLimits {
  const locked = envelope.spent > envelope.planned;
  return { locked, min: envelope.spent, removable: !locked && envelope.spent === 0 };
}

export type PlanChangeProblem =
  /** The same ID, category or savings line twice. */
  | "duplicate"
  /** An item changed kind or category, or a new one has the wrong kind of category. */
  | "changed"
  /** A locked item changed or was removed. */
  | "locked"
  /** An amount went below what's used of it. */
  | "below-used"
  /** A fixed cost with payments was removed. */
  | "has-payments";

/**
 * Checks a new plan against the current one (`before`, and `summary`
 * computed from it). Null when the change is allowed.
 */
export function checkPlanChange(
  summary: CycleSummary,
  before: readonly SummaryPlanItem[],
  after: readonly PlanDraftItem[],
): PlanChangeProblem | null {
  for (const item of after) assertAmount(item.amountMillimes);
  const categories = after.flatMap((i) => (i.categoryId === null ? [] : [i.categoryId]));
  if (
    new Set(after.map((i) => i.id)).size !== after.length ||
    new Set(categories).size !== categories.length ||
    after.filter((i) => i.kind === "savings").length > 1
  ) {
    return "duplicate";
  }

  const was = new Map(before.map((i) => [i.id, i]));
  for (const item of after) {
    const old = was.get(item.id);
    const changed = old
      ? old.kind !== item.kind || old.categoryId !== item.categoryId
      : (item.kind === "savings") !== (item.categoryId === null);
    if (changed) return "changed";
  }

  const next = new Map(after.map((i) => [i.id, i]));
  for (const cost of summary.fixedCosts) {
    const amount = next.get(cost.id)?.amountMillimes;
    if (amount === cost.planned) continue;
    const limits = fixedCostLimits(cost);
    if (limits.locked) return "locked";
    if (amount === undefined) {
      if (!limits.removable) return "has-payments";
    } else if (amount < limits.min) {
      return "below-used";
    }
  }

  for (const envelope of summary.envelopes) {
    // An envelope without a category: nothing is ever spent from it.
    if (envelope.categoryId === null) continue;
    const amount = totalBalance(
      after
        .filter((i) => i.kind === "envelope" && i.categoryId === envelope.categoryId)
        .map((i) => i.amountMillimes),
    );
    if (amount === envelope.planned) continue;
    const limits = envelopeLimits(envelope);
    if (limits.locked) return "locked";
    // Removing it (0) is below what's used too, once something is spent.
    if (amount < limits.min) return "below-used";
  }
  return null;
}

function assertAmount(amount: number): void {
  assertMillimes(amount);
  if (amount <= 0) throw new RangeError(`Invalid plan amount: ${amount} millimes.`);
}

/**
 * The plan items of a draft: an item kept from `before` keeps whether it's
 * paid and the time it covers from; a new one covers spending from `now`.
 */
export function applyPlanDraft(
  before: readonly SummaryPlanItem[],
  draft: readonly PlanDraftItem[],
  now: number,
): SummaryPlanItem[] {
  const was = new Map(before.map((i) => [i.id, i]));
  return draft.map((item) => {
    const old = was.get(item.id);
    return {
      id: item.id,
      kind: item.kind,
      categoryId: item.categoryId,
      amountMillimes: item.amountMillimes,
      paid: old?.paid ?? false,
      coversFrom: old ? (old.coversFrom ?? null) : now,
    };
  });
}

/**
 * Weekly mode: this week's stored amount after a plan change. It keeps the
 * lower of the stored amount and the amount rebuilt with the new plan, so a
 * bigger plan lowers it at once and a smaller one shows from next week.
 */
export function weekAfterPlanChange(
  stored: number,
  after: Omit<TodayBudgetInput, "weeklyMode" | "weekAllowance">,
): number {
  assertMillimes(stored);
  return Math.min(stored, weekStartAllowance(after).allowance);
}

export interface PlanPreviewInput {
  summary: CycleSummaryInput;
  weeklyMode: boolean;
  /** Weekly mode: this week's stored amount, if it's stored yet. */
  weekAllowance?: number | undefined;
  draft: readonly PlanDraftItem[];
  /** When the draft would be saved (milliseconds): new envelopes cover from then. */
  now: number;
}

export interface PlanNumbers {
  reserved: number;
  /** The daily money; negative when the plan needs more than there is. */
  poolNow: number;
  today: TodayBudget;
}

export interface PlanPreview {
  before: PlanNumbers;
  after: PlanNumbers;
  /**
   * Weekly mode: the change frees daily money, which this week's amount
   * doesn't take: it shows from next week.
   */
  fromNextWeek: boolean;
}

/**
 * Today's amount with the current plan and with the draft, as saving it
 * would make it. In weekly mode the week keeps the lower of its amount now
 * (stored, or rebuilt when it isn't stored yet) and the one rebuilt with
 * the draft.
 */
export function previewPlan(input: PlanPreviewInput): PlanPreview {
  const { summary: data, weeklyMode, weekAllowance } = input;
  const budgetOf = (planItems: readonly SummaryPlanItem[]) => {
    const summary = cycleSummary({ ...data, planItems });
    return {
      summary,
      budget: {
        today: data.today,
        startedOn: data.startedOn,
        nextTransferOn: data.nextTransferOn,
        poolNow: summary.poolNow,
        spentToday: summary.spentToday,
        spentThisWeekBeforeToday: summary.spentThisWeekBeforeToday,
      },
    };
  };
  const numbers = (
    { summary, budget }: ReturnType<typeof budgetOf>,
    stored: number | undefined,
  ): PlanNumbers => ({
    reserved: summary.reserved.total,
    poolNow: summary.poolNow,
    today: todayBudget({ ...budget, weeklyMode, weekAllowance: stored }),
  });

  const now = budgetOf(data.planItems);
  const next = budgetOf(applyPlanDraft(data.planItems, input.draft, input.now));
  const before = numbers(now, weekAllowance);
  const after = numbers(
    next,
    weeklyMode
      ? weekAfterPlanChange(weekAllowance ?? weekStartAllowance(now.budget).allowance, next.budget)
      : undefined,
  );
  return { before, after, fromNextWeek: weeklyMode && after.poolNow > before.poolNow };
}

const SUGGESTION_STEP = 5_000; // 5 DT
const SUGGESTION_SHARE_PERCENT = 20;

/**
 * A groceries envelope for the rest of the cycle, for a plan without one.
 * With groceries logged this cycle: the same pace until the next transfer,
 * rounded up to 5 DT. Without: 20% of this morning's daily money, rounded
 * down to 5 DT. Null when that's nothing.
 */
export function suggestGroceries(input: CycleSummaryInput, groceriesId: string): number | null {
  const { startedOn, nextTransferOn, today } = input;
  const spent = totalBalance(
    input.transactions
      .filter(
        (t) =>
          t.type === "expense" &&
          t.categoryId === groceriesId &&
          daysBetween(startedOn, t.day) >= 0 &&
          daysBetween(t.day, today) >= 0,
      )
      .map((t) => t.amountMillimes),
  );
  let amount: number;
  if (spent > 0) {
    const pace = mulDivFloor(
      spent,
      daysLeft(today, nextTransferOn),
      daysBetween(startedOn, today) + 1,
    );
    amount = ceilDiv(pace, SUGGESTION_STEP) * SUGGESTION_STEP;
  } else {
    const summary = cycleSummary(input);
    const morning = Math.max(0, summary.poolNow + summary.spentToday);
    const share = mulDivFloor(morning, SUGGESTION_SHARE_PERCENT, 100);
    amount = floorDiv(share, SUGGESTION_STEP) * SUGGESTION_STEP;
  }
  return amount > 0 ? amount : null;
}
