"use server";

import { logger } from "@mizania/auth";
import { planOnboarding, todayInTunis } from "@mizania/core";
import { saveOnboarding } from "@mizania/db/onboarding";
import { onboardingInputSchema, toOnboardingAnswers } from "@mizania/shared";
import { headers } from "next/headers";

import { getAuth } from "@/lib/auth";
import { getDb } from "@/lib/db";

export type CompleteOnboardingResult =
  { ok: true } | { ok: false; error: "signed-out" | "invalid" | "server" };

/**
 * Saves the whole onboarding at once. The user comes from the session, never
 * from the input. Retrying after a lost response is safe: saveOnboarding
 * does nothing once the user is onboarded, and reports success.
 */
export async function completeOnboarding(input: unknown): Promise<CompleteOnboardingResult> {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return { ok: false, error: "signed-out" };

  const parsed = onboardingInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };

  let plan;
  try {
    plan = planOnboarding(toOnboardingAnswers(parsed.data), todayInTunis());
  } catch {
    return { ok: false, error: "invalid" };
  }

  try {
    await saveOnboarding(getDb(), session.user.id, plan);
    return { ok: true };
  } catch (error) {
    logger.error(
      { event: "onboarding_failed", userId: session.user.id, err: error },
      "onboarding failed",
    );
    return { ok: false, error: "server" };
  }
}
