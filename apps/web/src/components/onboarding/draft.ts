import { type OnboardingFixedCost, parseTND } from "@mizania/core";
import type { OnboardingInput } from "@mizania/shared";

import type { Locale } from "@/i18n/routing";

// The wizard's answers while the student goes through the steps. Kept as
// typed text (amounts are parsed at the end) and saved in localStorage on
// every change, so a reload doesn't lose anything. Nothing reaches the
// server before "Finish".

export const STEPS = 4;
export type Step = 1 | 2 | 3 | 4;

export const bills = ["electricity", "water", "internet", "phone_recharge"] as const;
export type Bill = (typeof bills)[number];

export const optionalWallets = ["d17", "flouci", "card", "other"] as const;
export type OptionalWallet = (typeof optionalWallets)[number];

export interface CostDraft {
  enabled: boolean;
  amount: string;
  paid: boolean;
}

export interface WalletDraft {
  enabled: boolean;
  balance: string;
}

export interface Draft {
  version: 1;
  monthly: string;
  arrivalDay: number | null;
  rent: CostDraft;
  bills: Record<Bill, CostDraft>;
  /** Cash is always included. */
  cash: { balance: string };
  wallets: Record<OptionalWallet, WalletDraft>;
  otherName: string;
}

const cost = (enabled: boolean): CostDraft => ({ enabled, amount: "", paid: false });
const wallet = (): WalletDraft => ({ enabled: false, balance: "" });

export function emptyDraft(): Draft {
  return {
    version: 1,
    monthly: "",
    arrivalDay: null,
    rent: cost(true),
    bills: {
      electricity: cost(false),
      water: cost(false),
      internet: cost(false),
      phone_recharge: cost(false),
    },
    cash: { balance: "" },
    wallets: { d17: wallet(), flouci: wallet(), card: wallet(), other: wallet() },
    otherName: "",
  };
}

export const storageKey = (userId: string) => `mizania.onboarding.${userId}`;

/** A saved draft, or a fresh one if there's none or it's unreadable. */
export function parseDraft(raw: string | null): Draft {
  if (!raw) return emptyDraft();
  try {
    const parsed = JSON.parse(raw) as Partial<Draft>;
    if (parsed.version !== 1) return emptyDraft();
    // Merge over the defaults so a missing field can't break the wizard.
    const base = emptyDraft();
    return {
      ...base,
      ...parsed,
      rent: { ...base.rent, ...parsed.rent },
      bills: { ...base.bills, ...parsed.bills },
      cash: { ...base.cash, ...parsed.cash },
      wallets: { ...base.wallets, ...parsed.wallets },
    };
  } catch {
    return emptyDraft();
  }
}

/** A positive amount, or null. */
export function positiveAmount(text: string): number | null {
  const millimes = parseTND(text);
  return millimes !== null && millimes > 0 ? millimes : null;
}

/** A balance: empty means 0. */
export function balanceAmount(text: string): number | null {
  return text.trim() === "" ? 0 : parseTND(text);
}

const costValid = (c: CostDraft) => !c.enabled || positiveAmount(c.amount) !== null;

export function stepValid(draft: Draft, step: Step): boolean {
  switch (step) {
    case 1:
      return true;
    case 2:
      return positiveAmount(draft.monthly) !== null && draft.arrivalDay !== null;
    case 3:
      return costValid(draft.rent) && bills.every((b) => costValid(draft.bills[b]));
    case 4:
      return (
        balanceAmount(draft.cash.balance) !== null &&
        optionalWallets.every(
          (w) => !draft.wallets[w].enabled || balanceAmount(draft.wallets[w].balance) !== null,
        ) &&
        (!draft.wallets.other.enabled || draft.otherName.trim() !== "")
      );
  }
}

/** The furthest step the student may open: the first one not yet valid. */
export function furthestStep(draft: Draft): Step {
  for (const step of [1, 2, 3] as const) if (!stepValid(draft, step)) return step;
  return 4;
}

/** What "Finish" sends. Call only when every step is valid. */
export function toInput(draft: Draft, locale: Locale): OnboardingInput {
  const fixedCosts: OnboardingInput["fixedCosts"] = [];
  const addCost = (key: OnboardingFixedCost, c: CostDraft) => {
    const amount = positiveAmount(c.amount);
    if (c.enabled && amount !== null) {
      fixedCosts.push({ key, amountMillimes: amount, alreadyPaid: c.paid });
    }
  };
  addCost("rent", draft.rent);
  for (const b of bills) addCost(b, draft.bills[b]);

  const wallets: OnboardingInput["wallets"] = [
    { kind: "cash", balanceMillimes: balanceAmount(draft.cash.balance) ?? 0 },
  ];
  for (const kind of optionalWallets) {
    const w = draft.wallets[kind];
    if (!w.enabled) continue;
    const entry: OnboardingInput["wallets"][number] = {
      kind: kind,
      balanceMillimes: balanceAmount(w.balance) ?? 0,
    };
    if (kind === "other") entry.name = draft.otherName.trim();
    wallets.push(entry);
  }

  return {
    locale,
    monthlyMillimes: positiveAmount(draft.monthly) ?? 0,
    arrivalDay: draft.arrivalDay ?? 1,
    fixedCosts,
    wallets,
  };
}
