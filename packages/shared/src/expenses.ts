import { z } from "zod";

import { positiveMillimes } from "./money";

// What quick log sends to the server. The user always comes from the session.

export const logExpenseSchema = z
  .object({
    // Made by the client, so a repeated request saves the expense once.
    id: z.uuid(),
    amountMillimes: positiveMillimes,
    categoryId: z.uuid(),
    walletId: z.uuid(),
  })
  .strict();
export type LogExpenseInput = z.infer<typeof logExpenseSchema>;

/** Delete (soft) or bring back one expense. */
export const expenseIdSchema = z.object({ transactionId: z.uuid() }).strict();
export type ExpenseIdInput = z.infer<typeof expenseIdSchema>;
