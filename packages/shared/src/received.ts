import { assertIsoDate, incomeSources } from "@mizania/core";
import { z } from "zod";

import { positiveMillimes } from "./money";
import { PLAN_MAX_ITEMS, planDraftItemSchema } from "./month-plan";

// Money received: extra money, a new month, and a late transfer. The user
// always comes from the session.

/** A calendar day, YYYY-MM-DD, that exists. */
export const isoDateSchema = z.string().refine((value) => {
  try {
    assertIsoDate(value);
    return true;
  } catch {
    return false;
  }
}, "Not a date");

export const incomeSourceSchema = z.enum(incomeSources);

const received = {
  amountMillimes: positiveMillimes,
  walletId: z.uuid(),
  source: incomeSourceSchema,
};

export const receiveExtraSchema = z
  .object({
    // Made by the client, so a repeated request saves the money once.
    id: z.uuid(),
    ...received,
  })
  .strict();
export type ReceiveExtraInput = z.infer<typeof receiveExtraSchema>;

/** Undo extra money. */
export const incomeIdSchema = z.object({ id: z.uuid() }).strict();
export type IncomeIdInput = z.infer<typeof incomeIdSchema>;

export const startNewMonthSchema = z
  .object({
    /** The month that ends: a retry after it ended changes nothing. */
    cycleId: z.uuid(),
    /** Made by the client: the money received, recorded once. */
    incomeId: z.uuid(),
    ...received,
    expectedNextOn: isoDateSchema,
    /** The new month's whole plan. */
    items: z.array(planDraftItemSchema).max(PLAN_MAX_ITEMS),
  })
  .strict();
export type StartNewMonthInput = z.infer<typeof startNewMonthSchema>;

export const moveExpectedDateSchema = z
  .object({
    cycleId: z.uuid(),
    expectedOn: isoDateSchema,
  })
  .strict();
export type MoveExpectedDateInput = z.infer<typeof moveExpectedDateSchema>;
