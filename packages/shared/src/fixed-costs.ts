import { z } from "zod";

import { positiveMillimes } from "./money";

// Paying the fixed costs of the plan. The user always comes from the session.

export const payFixedCostSchema = z
  .object({
    // Made by the client, so a repeated request saves the payment once.
    id: z.uuid(),
    planItemId: z.uuid(),
    /** The amount actually paid, which can differ from the plan. */
    amountMillimes: positiveMillimes,
    walletId: z.uuid(),
    /** "That's everything for this month": marks the fixed cost paid. */
    final: z.boolean(),
  })
  .strict();
export type PayFixedCostInput = z.infer<typeof payFixedCostSchema>;

/** Undo the latest payment, or mark paid without paying more. */
export const planItemIdSchema = z.object({ planItemId: z.uuid() }).strict();
export type PlanItemIdInput = z.infer<typeof planItemIdSchema>;
