"use client";

import {
  expectedDateRange,
  type IncomeSource,
  incomeSources,
  newMonthInput,
  suggestGroceries,
} from "@mizania/core";
import type { QuickLogOptions } from "@mizania/db/expenses";
import type { ReceiveOptions } from "@mizania/db/received";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { useId, useMemo, useState, useTransition } from "react";

import { receiveExtraAction, startNewMonthAction } from "@/app/actions/received";
import { AmountDisplay, Keypad, useAmountEntry } from "@/components/amount/amount-entry";
import { PlanDraftEditor } from "@/components/plan/plan-editor";
import { Button } from "@/components/ui/button";
import { useFormatAmount, useWalletName } from "@/components/wallets/shared";
import { useOnline } from "@/hooks/use-online";
import { useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import type { WalletActionError } from "@/lib/wallet-action";

// "I received money" (ADR 006 §6): the amount, the wallet, what it is (the
// monthly money or extra money) and where it's from. Extra money is saved
// at once; the monthly money opens the new month's plan to review first.

const receiveErrors = ["invalid", "not-found", "wallet-archived", "signed-out", "server"] as const;
type ReceiveError = (typeof receiveErrors)[number];
const receiveError = (error: WalletActionError): ReceiveError =>
  receiveErrors.find((e) => e === error) ?? "server";

/** Noon UTC is the same calendar day in Tunis. */
const asDate = (day: string) => new Date(`${day}T12:00:00Z`);

export function ReceiveFlow({
  options,
  wallets,
  initialKind,
}: {
  options: ReceiveOptions;
  wallets: QuickLogOptions["wallets"];
  initialKind: "month" | "extra";
}) {
  const t = useTranslations("Received");
  const router = useRouter();
  const online = useOnline();
  const walletName = useWalletName();
  const walletSelectId = useId();
  const entry = useAmountEntry();
  const [walletId, setWalletId] = useState(options.defaultWalletId ?? wallets[0]?.id ?? "");
  const [kind, setKind] = useState(initialKind);
  const [source, setSource] = useState<IncomeSource>("parents");
  const [step, setStep] = useState<"money" | "review">("money");
  // One ID for the money received: a retry after a lost response saves it once.
  const [incomeId] = useState(() => crypto.randomUUID());
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<ReceiveError | null>(null);
  const { amount } = entry;
  const ready = amount !== null && amount > 0 && walletId !== "" && online && !pending;

  function saveExtra() {
    if (amount === null) return;
    setError(null);
    startTransition(async () => {
      let result: Awaited<ReturnType<typeof receiveExtraAction>>;
      try {
        result = await receiveExtraAction({
          id: incomeId,
          amountMillimes: amount,
          walletId,
          source,
        });
      } catch {
        result = { ok: false, error: "server" };
      }
      if (!result.ok) {
        setError(receiveError(result.error));
        return;
      }
      router.push(`/?received=${incomeId}`);
      router.refresh();
    });
  }

  if (step === "review" && amount !== null) {
    return (
      <NewMonthReview
        options={options}
        incomeId={incomeId}
        amountMillimes={amount}
        walletId={walletId}
        source={source}
        walletLabel={walletName(
          wallets.find((w) => w.id === walletId) ?? { type: "other", name: "" },
        )}
        onBack={() => {
          setStep("money");
        }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-5" {...entry.handlers}>
      <section className="flex flex-col gap-3">
        <p className="text-center text-sm text-muted-foreground">{t("amountLabel")}</p>
        <AmountDisplay entry={entry} testId="received-amount" />
        <Keypad entry={entry} />
        <div className="flex items-center gap-2 text-sm">
          <label htmlFor={walletSelectId} className="text-muted-foreground">
            {t("wallet")}
          </label>
          <select
            id={walletSelectId}
            className="h-9 flex-1 rounded-md border bg-background px-2"
            value={walletId}
            onChange={(e) => {
              setWalletId(e.target.value);
            }}
          >
            {wallets.map((w) => (
              <option key={w.id} value={w.id}>
                {walletName(w)}
              </option>
            ))}
          </select>
        </div>
      </section>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">{t("kindLabel")}</legend>
        <div className="grid grid-cols-2 gap-2">
          {(["month", "extra"] as const).map((k) => (
            <label
              key={k}
              className={cn(
                "flex min-h-16 cursor-pointer flex-col justify-center rounded-xl border px-3 py-2 has-[:checked]:border-primary has-[:checked]:bg-primary/5",
              )}
            >
              <input
                type="radio"
                name="kind"
                className="sr-only"
                checked={kind === k}
                onChange={() => {
                  setKind(k);
                }}
              />
              <span className="text-sm font-medium">
                {k === "month" ? t("kindMonth") : t("kindExtra")}
              </span>
              <span className="text-xs text-muted-foreground">
                {k === "month" ? t("kindMonthHint") : t("kindExtraHint")}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">{t("sourceLabel")}</legend>
        <div className="flex flex-wrap gap-2">
          {incomeSources.map((s) => (
            <label
              key={s}
              className="cursor-pointer rounded-full border px-3 py-1.5 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary has-[:checked]:text-primary-foreground"
            >
              <input
                type="radio"
                name="source"
                className="sr-only"
                checked={source === s}
                onChange={() => {
                  setSource(s);
                }}
              />
              {t(`sources.${s}`)}
            </label>
          ))}
        </div>
      </fieldset>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {t(`errors.${error}`)}
        </p>
      )}
      {!online && <p className="text-sm text-muted-foreground">{t("offline")}</p>}
      {kind === "month" ? (
        <Button
          size="lg"
          disabled={!ready}
          onClick={() => {
            setStep("review");
          }}
        >
          {t("next")}
        </Button>
      ) : (
        <Button size="lg" disabled={!ready} onClick={saveExtra}>
          {pending ? t("saving") : t("save")}
        </Button>
      )}
    </div>
  );
}

/** The new month before it starts: its expected date, what's left, and its plan. */
function NewMonthReview({
  options,
  incomeId,
  amountMillimes,
  walletId,
  source,
  walletLabel,
  onBack,
}: {
  options: ReceiveOptions;
  incomeId: string;
  amountMillimes: number;
  walletId: string;
  source: IncomeSource;
  walletLabel: string;
  onBack: () => void;
}) {
  const t = useTranslations("Received");
  const locale = useLocale();
  const format = useFormatter();
  const router = useRouter();
  const formatAmount = useFormatAmount();
  const dateId = useId();
  const today = options.input.today;
  const [expectedOn, setExpectedOn] = useState(options.nextExpectedOn);
  const range = expectedDateRange(today, today);
  const validDate = expectedOn >= range.min && expectedOn <= range.max;
  // The new month's numbers before it's saved: the money received comes in
  // after everything logged so far.
  const input = useMemo(
    () =>
      newMonthInput(options.input, {
        cycleId: incomeId,
        nextTransferOn: validDate ? expectedOn : options.nextExpectedOn,
        income: {
          walletId,
          amountMillimes,
          at: options.input.transactions.reduce((latest, x) => Math.max(latest, x.at), 0) + 1,
        },
      }),
    [options, incomeId, expectedOn, validDate, walletId, amountMillimes],
  );
  const groceriesCategory = options.categories.find((c) => c.key === "groceries");
  const suggested =
    groceriesCategory && !options.copy.some((i) => i.categoryId === groceriesCategory.id)
      ? suggestGroceries(input, groceriesCategory.id, options.groceriesLastMonth)
      : null;
  const unpaid = options.plan.fixedCosts.filter((c) => !c.paid && c.left > 0);

  return (
    <div className="flex flex-1 flex-col gap-5">
      <section className="flex flex-col gap-3" data-testid="new-month">
        <h2 className="text-lg font-semibold">{t("reviewTitle")}</h2>
        <p className="text-sm" data-testid="new-month-received">
          {t("reviewReceived", { amount: formatAmount(amountMillimes) })} · {walletLabel}
        </p>
        <div className="flex flex-col gap-1">
          <label htmlFor={dateId} className="text-sm text-muted-foreground">
            {t("expectedLabel")}
          </label>
          <input
            id={dateId}
            type="date"
            className="h-11 rounded-md border bg-background px-3"
            value={expectedOn}
            min={range.min}
            max={range.max}
            onChange={(e) => {
              setExpectedOn(e.target.value);
            }}
          />
          {validDate && (
            <span className="text-xs text-muted-foreground">
              {format.dateTime(asDate(expectedOn), {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}
            </span>
          )}
        </div>
        <div className="rounded-xl border p-3 text-sm" data-testid="new-month-leftover">
          <p className="font-medium">{t("leftover", { amount: formatAmount(options.leftover) })}</p>
          <p className="text-xs text-muted-foreground">{t("leftoverHint")}</p>
        </div>
        {unpaid.map((cost) => (
          <p key={cost.id} className="text-xs text-muted-foreground" data-testid="new-month-unpaid">
            {t("unpaid", {
              name: cost.names?.[locale] ?? cost.name ?? "",
              amount: formatAmount(cost.left),
            })}
          </p>
        ))}
      </section>

      <PlanDraftEditor
        input={input}
        weeklyMode={options.weeklyMode}
        weekAllowance={undefined}
        initial={options.copy}
        plan={null}
        categories={options.categories}
        groceries={
          groceriesCategory && suggested !== null
            ? { categoryId: groceriesCategory.id, suggested }
            : null
        }
        newMonth
        onCancel={onBack}
        onSave={(items) =>
          validDate
            ? startNewMonthAction({
                cycleId: options.cycleId,
                incomeId,
                amountMillimes,
                walletId,
                source,
                expectedNextOn: expectedOn,
                items,
              })
            : Promise.resolve({ ok: false, error: "invalid" })
        }
        onSaved={() => {
          router.push("/");
          router.refresh();
        }}
      />
    </div>
  );
}
