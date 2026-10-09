"use client";

import { nextTransferDate, onboardingEnvelopes, todayInTunis } from "@mizania/core";
import { ArrowLeftIcon, ArrowRightIcon, CheckIcon } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { useEffect, useState, useSyncExternalStore } from "react";

import { completeOnboarding } from "@/app/actions/onboarding";
import { FormMessage, OfflineNotice } from "@/components/auth/form-parts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useOnline } from "@/hooks/use-online";
import { useRouter } from "@/i18n/navigation";
import { type Locale, routing } from "@/i18n/routing";
import { cn } from "@/lib/utils";

import {
  bills,
  type CostDraft,
  type Draft,
  furthestStep,
  optionalWallets,
  parseDraft,
  type Step,
  STEPS,
  stepValid,
  storageKey,
  toInput,
} from "./draft";
import { Checkbox, MoneyInput } from "./fields";

const SERVER = "\u0000server";
const noSubscription = () => () => undefined;

/** The step a URL query asks for ("?step=3"), or 1. */
function stepFromQuery(value: string | null): number {
  const step = Number(value);
  return Number.isInteger(step) && step >= 1 && step <= STEPS ? step : 1;
}

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null; // storage blocked: the wizard works, it just won't survive a reload
  }
}

function writeStorage(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Same as above.
  }
}

/**
 * The onboarding wizard. The answers live in localStorage (per user) until
 * "Finish" saves them all at once; the step is in the URL (?step=2).
 */
export function OnboardingWizard({ userId }: { userId: string }) {
  const t = useTranslations("Onboarding");
  const key = storageKey(userId);
  // Read after hydration: the server can't see this browser's storage.
  const raw = useSyncExternalStore(
    noSubscription,
    () => readStorage(key),
    () => SERVER,
  );

  if (raw === SERVER) {
    return <p className="py-12 text-center text-muted-foreground">{t("loading")}</p>;
  }
  return <Wizard storageKey={key} initial={parseDraft(raw)} />;
}

function Wizard({ storageKey: key, initial }: { storageKey: string; initial: Draft }) {
  const t = useTranslations("Onboarding");
  const locale = useLocale();
  const router = useRouter();
  const online = useOnline();
  const searchParams = useSearchParams();
  const [draft, setDraft] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  // The step is ours, mirrored in the URL (?step=N) so a reload and the
  // back button work. Next.js's own pushState sync isn't relied on: it stops
  // following after a language switch.
  const [requested, setRequested] = useState(() => stepFromQuery(searchParams.get("step")));
  useEffect(() => {
    const onPopState = () => {
      setRequested(stepFromQuery(new URLSearchParams(window.location.search).get("step")));
    };
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
    };
  }, []);
  // The URL may ask for a step that isn't reachable yet (after a reload, or
  // a typed URL): show the first step that still needs an answer instead.
  const step = Math.min(requested, furthestStep(draft)) as Step;

  function update(change: (d: Draft) => Draft) {
    const next = change(draft);
    setDraft(next);
    writeStorage(key, JSON.stringify(next));
  }

  function goTo(target: number) {
    // Keep Next.js's history state: its router needs it on back/forward.
    window.history.pushState(window.history.state, "", `?step=${target}`);
    setRequested(target);
  }

  async function finish() {
    setSaving(true);
    setFailed(false);
    let result;
    try {
      result = await completeOnboarding(toInput(draft, locale));
    } catch {
      result = { ok: false as const, error: "server" as const };
    }
    if (result.ok) {
      writeStorage(key, null);
      router.replace("/");
      router.refresh();
      return;
    }
    if (result.error === "signed-out") {
      router.replace("/sign-in");
      return;
    }
    setSaving(false);
    setFailed(true);
  }

  const valid = stepValid(draft, step);

  return (
    <div className="flex flex-1 flex-col gap-6">
      <div className="flex flex-col gap-2">
        <p className="text-sm text-muted-foreground" data-testid="onboarding-progress">
          {t("progress", { step, total: STEPS })}
        </p>
        <div className="flex gap-1" aria-hidden>
          {Array.from({ length: STEPS }, (_, i) => (
            <span
              key={i}
              className={cn("h-1.5 flex-1 rounded-full", i < step ? "bg-primary" : "bg-muted")}
            />
          ))}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-6">
        {step === 1 && <LanguageStep />}
        {step === 2 && <MoneyStep draft={draft} update={update} />}
        {step === 3 && <FixedCostsStep draft={draft} update={update} />}
        {step === 4 && <WalletsStep draft={draft} update={update} />}
      </div>

      <div className="sticky bottom-0 flex flex-col gap-3 bg-background pb-4 pt-2">
        {step === STEPS && <OfflineNotice />}
        {failed && <FormMessage tone="error">{t("error")}</FormMessage>}
        <div className="flex gap-3">
          {step > 1 && (
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={() => {
                goTo(step - 1);
              }}
              disabled={saving}
            >
              <ArrowLeftIcon className="rtl:rotate-180" aria-hidden />
              {t("back")}
            </Button>
          )}
          {step < STEPS ? (
            <Button
              type="button"
              size="lg"
              className="flex-1"
              disabled={!valid}
              onClick={() => {
                goTo(step + 1);
              }}
            >
              {t("next")}
              <ArrowRightIcon className="rtl:rotate-180" aria-hidden />
            </Button>
          ) : (
            <Button
              type="button"
              size="lg"
              className="flex-1"
              disabled={!valid || saving || !online}
              onClick={() => void finish()}
            >
              {saving ? t("saving") : t("finish")}
              {!saving && <CheckIcon aria-hidden />}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

interface StepProps {
  draft: Draft;
  update: (change: (d: Draft) => Draft) => void;
}

function StepHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <h1 className="text-2xl font-bold">{title}</h1>
      {subtitle && <p className="text-muted-foreground">{subtitle}</p>}
    </div>
  );
}

function LanguageStep() {
  const t = useTranslations("Onboarding.language");
  const languages = useTranslations("LanguageSwitcher");
  const locale = useLocale();
  const router = useRouter();

  return (
    <>
      <StepHeading title={t("title")} subtitle={t("subtitle")} />
      <div className="flex flex-col gap-3" role="radiogroup" aria-label={t("title")}>
        {routing.locales.map((l: Locale) => (
          <button
            key={l}
            type="button"
            role="radio"
            aria-checked={l === locale}
            lang={l}
            className={cn(
              "flex min-h-14 items-center justify-between rounded-lg border px-4 text-lg",
              l === locale ? "border-primary bg-primary/10 font-semibold" : "hover:bg-accent",
            )}
            onClick={() => {
              // Same wizard in the other language; the answers are kept.
              if (l !== locale)
                router.replace({ pathname: "/onboarding", query: { step: "1" } }, { locale: l });
            }}
          >
            {languages("locale", { locale: l })}
            {l === locale && <CheckIcon className="size-5 text-primary" aria-hidden />}
          </button>
        ))}
      </div>
    </>
  );
}

function MoneyStep({ draft, update }: StepProps) {
  const t = useTranslations("Onboarding.money");
  const format = useFormatter();
  const next =
    draft.arrivalDay === null ? null : nextTransferDate(todayInTunis(), draft.arrivalDay);

  return (
    <>
      <StepHeading title={t("title")} />
      <MoneyInput
        label={t("amountLabel")}
        value={draft.monthly}
        placeholder="600"
        onChange={(monthly) => {
          update((d) => ({ ...d, monthly }));
        }}
      />
      <div className="flex flex-col gap-2">
        <p id="arrival-day-label" className="text-sm font-medium">
          {t("dayLabel")}
        </p>
        <div className="grid grid-cols-7 gap-1.5" role="group" aria-labelledby="arrival-day-label">
          {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
            <button
              key={day}
              type="button"
              aria-pressed={draft.arrivalDay === day}
              className={cn(
                "flex h-11 items-center justify-center rounded-md border text-sm tabular-nums",
                draft.arrivalDay === day
                  ? "border-primary bg-primary font-semibold text-primary-foreground"
                  : "hover:bg-accent",
              )}
              onClick={() => {
                update((d) => ({ ...d, arrivalDay: day }));
              }}
            >
              {day}
            </button>
          ))}
        </div>
        {next && (
          <p className="text-sm text-primary" data-testid="next-transfer">
            {t("nextTransfer", {
              // Noon UTC is the same calendar day in Tunis.
              date: format.dateTime(new Date(`${next}T12:00:00Z`), {
                weekday: "long",
                day: "numeric",
                month: "long",
              }),
            })}
          </p>
        )}
      </div>
    </>
  );
}

function CostFields({
  cost,
  label,
  envelope = false,
  onChange,
}: {
  cost: CostDraft;
  label: string;
  /** Planned as an envelope (phone recharge): it's never "already paid". */
  envelope?: boolean;
  onChange: (cost: CostDraft) => void;
}) {
  const t = useTranslations("Onboarding.fixedCosts");
  return (
    <div className="flex flex-col gap-3 ps-8">
      <MoneyInput
        label={label}
        value={cost.amount}
        onChange={(amount) => {
          onChange({ ...cost, amount });
        }}
      />
      {envelope ? (
        <p className="text-xs text-muted-foreground">{t("rechargeHint")}</p>
      ) : (
        <Checkbox
          checked={cost.paid}
          onChange={(paid) => {
            onChange({ ...cost, paid });
          }}
        >
          {t("alreadyPaid")}
        </Checkbox>
      )}
    </div>
  );
}

function FixedCostsStep({ draft, update }: StepProps) {
  const t = useTranslations("Onboarding.fixedCosts");

  return (
    <>
      <StepHeading title={t("title")} subtitle={t("subtitle")} />
      <section className="flex flex-col gap-2 rounded-lg border p-4">
        <Checkbox
          checked={draft.rent.enabled}
          testId="cost-rent"
          onChange={(enabled) => {
            update((d) => ({ ...d, rent: { ...d.rent, enabled } }));
          }}
        >
          {t("rent")}
        </Checkbox>
        {draft.rent.enabled && (
          <CostFields
            cost={draft.rent}
            label={t("rentAmount")}
            onChange={(rent) => {
              update((d) => ({ ...d, rent }));
            }}
          />
        )}
      </section>
      <section className="flex flex-col gap-2 rounded-lg border p-4">
        <h2 className="font-semibold">{t("billsTitle")}</h2>
        {bills.map((bill) => (
          <div key={bill} className="flex flex-col gap-2">
            <Checkbox
              checked={draft.bills[bill].enabled}
              testId={`cost-${bill}`}
              onChange={(enabled) => {
                update((d) => ({
                  ...d,
                  bills: { ...d.bills, [bill]: { ...d.bills[bill], enabled } },
                }));
              }}
            >
              {t(`names.${bill}`)}
            </Checkbox>
            {draft.bills[bill].enabled && (
              <CostFields
                cost={draft.bills[bill]}
                label={t("amount")}
                envelope={onboardingEnvelopes.includes(bill)}
                onChange={(cost) => {
                  update((d) => ({ ...d, bills: { ...d.bills, [bill]: cost } }));
                }}
              />
            )}
          </div>
        ))}
      </section>
    </>
  );
}

function WalletsStep({ draft, update }: StepProps) {
  const t = useTranslations("Onboarding.wallets");
  const types = useTranslations("WalletTypes");

  return (
    <>
      <StepHeading title={t("title")} subtitle={t("subtitle")} />
      <section className="flex flex-col gap-2 rounded-lg border p-4">
        <h2 className="font-semibold">{types("cash")}</h2>
        <MoneyInput
          label={t("balance")}
          value={draft.cash.balance}
          placeholder="0"
          onChange={(balance) => {
            update((d) => ({ ...d, cash: { balance } }));
          }}
        />
      </section>
      {optionalWallets.map((kind) => {
        const wallet = draft.wallets[kind];
        const set = (change: Partial<typeof wallet>) => {
          update((d) => ({
            ...d,
            wallets: { ...d.wallets, [kind]: { ...d.wallets[kind], ...change } },
          }));
        };
        return (
          <section key={kind} className="flex flex-col gap-2 rounded-lg border p-4">
            <Checkbox
              checked={wallet.enabled}
              testId={`wallet-${kind}`}
              onChange={(enabled) => {
                set({ enabled });
              }}
            >
              <span className="font-semibold">{types(kind)}</span>
            </Checkbox>
            {wallet.enabled && (
              <div className="flex flex-col gap-3 ps-8">
                {kind === "other" && (
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="other-wallet-name">{t("otherName")}</Label>
                    <Input
                      id="other-wallet-name"
                      maxLength={40}
                      value={draft.otherName}
                      placeholder={t("otherNamePlaceholder")}
                      onChange={(e) => {
                        const otherName = e.target.value;
                        update((d) => ({ ...d, otherName }));
                      }}
                    />
                  </div>
                )}
                <MoneyInput
                  label={t("balance")}
                  value={wallet.balance}
                  placeholder="0"
                  onChange={(balance) => {
                    set({ balance });
                  }}
                />
              </div>
            )}
          </section>
        );
      })}
    </>
  );
}
