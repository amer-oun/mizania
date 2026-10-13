import { z } from "zod";

import { positiveMillimes } from "./money";

// Saving the month plan. The user always comes from the session.

/** The most items a plan can have: every fixed and envelope category, and savings. */
export const PLAN_MAX_ITEMS = 40;

export const planDraftItemSchema = z
  .object({
    // Made by the client for a new item, so saving twice adds it once.
    id: z.uuid(),
    kind: z.enum(["fixed", "envelope", "savings"]),
    /** Null only for savings. */
    categoryId: z.uuid().nullable(),
    amountMillimes: positiveMillimes,
  })
  .strict();

export const savePlanSchema = z
  .object({
    /** The cycle the plan was edited in: a plan from an earlier month is refused. */
    cycleId: z.uuid(),
    /** The whole plan: items left out are removed. */
    items: z.array(planDraftItemSchema).max(PLAN_MAX_ITEMS),
  })
  .strict();
export type SavePlanInput = z.infer<typeof savePlanSchema>;
