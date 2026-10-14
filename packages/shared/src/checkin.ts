import { z } from "zod";

import { notNegativeMillimes, positiveMillimes } from "./money";
import { incomeSourceSchema } from "./received";

// The evening check-in. The user always comes from the session.

export const checkInSchema = z
  .object({
    // Made by the client, so a repeated request saves the check-in once.
    id: z.uuid(),
    walletId: z.uuid(),
    /** What she counted. */
    countedMillimes: notNegativeMillimes,
    /** Counted more than expected: income, or "I miscounted earlier". */
    answer: z.enum(["income", "correction"]).optional(),
    /** With answer "income": where the money came from. */
    source: incomeSourceSchema.optional(),
    /** With an answer: the difference she was shown, so a change in between is caught. */
    seenMillimes: positiveMillimes.optional(),
  })
  .strict();
export type CheckInInput = z.infer<typeof checkInSchema>;

export const checkInIdSchema = z.object({ id: z.uuid() }).strict();
export type CheckInIdInput = z.infer<typeof checkInIdSchema>;

/** Picking a category for unlogged spending. */
export const categorizeUnloggedSchema = z
  .object({ transactionId: z.uuid(), categoryId: z.uuid() })
  .strict();
export type CategorizeUnloggedInput = z.infer<typeof categorizeUnloggedSchema>;
