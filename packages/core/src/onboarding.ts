// Turns the onboarding answers into what the first cycle starts with.
// Pure: the server writes exactly what this returns.

import { assertIsoDate, type IsoDate, nextTransferDate } from "./cycle";
import { assertMillimes, type Locale } from "./money";

export const walletKinds = ["cash", "d17", "flouci", "card", "other"] as const;
export type WalletKind = (typeof walletKinds)[number];

/**
 * Monthly costs asked about during onboarding ("rent and bills"); each is a
 * default category key. Phone recharge is topped up several times a month,
 * so it becomes an envelope; the others are fixed costs.
 */
export const onboardingFixedCosts = [
  "rent",
  "electricity",
  "water",
  "internet",
  "phone_recharge",
] as const;
export type OnboardingFixedCost = (typeof onboardingFixedCosts)[number];

/** Onboarding costs planned as envelopes rather than fixed costs. */
export const onboardingEnvelopes: readonly OnboardingFixedCost[] = ["phone_recharge"];

/** Longest name for an "other" wallet. */
export const WALLET_NAME_MAX_LENGTH = 40;

export interface OnboardingAnswers {
  locale: Locale;
  /** What usually arrives each month, in millimes. */
  monthlyMillimes: number;
  /** Day of the month it usually arrives, 1–31. */
  arrivalDay: number;
  fixedCosts: readonly {
    key: OnboardingFixedCost;
    /** Per month, in millimes. */
    amountMillimes: number;
    /** Already paid in this cycle, so not set aside again. Ignored for envelopes. */
    alreadyPaid: boolean;
  }[];
  wallets: readonly {
    kind: WalletKind;
    /** Only for "other" wallets (required there); ignored for the others. */
    name?: string | undefined;
    /** What's in the wallet right now, in millimes (0 or more). */
    balanceMillimes: number;
  }[];
}

export interface OnboardingPlan {
  user: { locale: Locale; usualMonthlyMillimes: number; usualArrivalDay: number };
  cycle: { startedOn: IsoDate; expectedNextOn: IsoDate };
  /** In the order shown; `name` is null except for "other" wallets. */
  wallets: { kind: WalletKind; name: string | null; position: number }[];
  /** One per wallet that isn't empty: its starting balance. */
  startingBalances: { walletIndex: number; amountMillimes: number }[];
  /** Fixed costs and envelopes of the first cycle, named by their default category. */
  fixedCosts: {
    categoryKey: OnboardingFixedCost;
    kind: "fixed" | "envelope";
    amountMillimes: number;
    /** Fixed costs only; an envelope is never "paid". */
    paid: boolean;
  }[];
}

function fail(message: string): never {
  throw new RangeError(`Invalid onboarding answers: ${message}`);
}

function assertPositive(value: number, what: string): void {
  assertMillimes(value);
  if (value <= 0) fail(`${what} must be more than 0.`);
}

/**
 * Checks the answers and plans the first cycle: it starts `today` and runs
 * until the next usual arrival day. Throws a RangeError on invalid answers.
 */
export function planOnboarding(answers: OnboardingAnswers, today: IsoDate): OnboardingPlan {
  assertIsoDate(today);
  assertPositive(answers.monthlyMillimes, "the monthly amount");
  const expectedNextOn = nextTransferDate(today, answers.arrivalDay);

  const costKeys = answers.fixedCosts.map((c) => c.key);
  if (new Set(costKeys).size !== costKeys.length) fail("a fixed cost appears twice.");
  for (const cost of answers.fixedCosts) assertPositive(cost.amountMillimes, cost.key);

  if (answers.wallets.length === 0) fail("at least one wallet is needed.");
  const kinds = answers.wallets.filter((w) => w.kind !== "other").map((w) => w.kind);
  if (new Set(kinds).size !== kinds.length) fail("a wallet type appears twice.");

  const wallets = answers.wallets.map((wallet, position) => {
    assertMillimes(wallet.balanceMillimes);
    if (wallet.balanceMillimes < 0) fail("a wallet balance can't be negative.");
    if (wallet.kind !== "other") return { kind: wallet.kind, name: null, position };

    const name = wallet.name?.trim() ?? "";
    if (name === "") fail('an "other" wallet needs a name.');
    if (name.length > WALLET_NAME_MAX_LENGTH) fail("a wallet name is too long.");
    return { kind: wallet.kind, name, position };
  });

  return {
    user: {
      locale: answers.locale,
      usualMonthlyMillimes: answers.monthlyMillimes,
      usualArrivalDay: answers.arrivalDay,
    },
    cycle: { startedOn: today, expectedNextOn },
    wallets,
    startingBalances: answers.wallets.flatMap((wallet, walletIndex) =>
      wallet.balanceMillimes > 0 ? [{ walletIndex, amountMillimes: wallet.balanceMillimes }] : [],
    ),
    fixedCosts: answers.fixedCosts.map((cost) => {
      const envelope = onboardingEnvelopes.includes(cost.key);
      return {
        categoryKey: cost.key,
        kind: envelope ? ("envelope" as const) : ("fixed" as const),
        amountMillimes: cost.amountMillimes,
        paid: !envelope && cost.alreadyPaid,
      };
    }),
  };
}
