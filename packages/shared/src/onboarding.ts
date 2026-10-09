import {
  type OnboardingAnswers,
  onboardingFixedCosts,
  WALLET_NAME_MAX_LENGTH,
  walletKinds,
} from "@mizania/core";
import { z } from "zod";

import { notNegativeMillimes, positiveMillimes } from "./money";

const walletSchema = z
  .object({
    kind: z.enum(walletKinds),
    name: z.string().trim().max(WALLET_NAME_MAX_LENGTH).optional(),
    balanceMillimes: notNegativeMillimes,
  })
  .strict()
  .refine((w) => w.kind !== "other" || (w.name !== undefined && w.name !== ""), {
    message: 'An "other" wallet needs a name',
    path: ["name"],
  });

/**
 * What the onboarding wizard sends when the student taps "Finish".
 * planOnboarding (packages/core) checks the same rules again before saving.
 */
export const onboardingInputSchema = z
  .object({
    locale: z.enum(["ar", "fr", "en"]),
    monthlyMillimes: positiveMillimes,
    arrivalDay: z.number().int().min(1).max(31),
    fixedCosts: z
      .array(
        z
          .object({
            key: z.enum(onboardingFixedCosts),
            amountMillimes: positiveMillimes,
            alreadyPaid: z.boolean(),
          })
          .strict(),
      )
      .max(onboardingFixedCosts.length)
      .refine((costs) => new Set(costs.map((c) => c.key)).size === costs.length, {
        message: "A fixed cost appears twice",
      }),
    wallets: z
      .array(walletSchema)
      .min(1)
      .max(12)
      .refine(
        (wallets) => {
          const kinds = wallets.filter((w) => w.kind !== "other").map((w) => w.kind);
          return new Set(kinds).size === kinds.length;
        },
        { message: "A wallet type appears twice" },
      ),
  })
  .strict();

export type OnboardingInput = z.infer<typeof onboardingInputSchema>;

// The schema's output is exactly what planOnboarding takes.
export const toOnboardingAnswers = (input: OnboardingInput): OnboardingAnswers => input;
