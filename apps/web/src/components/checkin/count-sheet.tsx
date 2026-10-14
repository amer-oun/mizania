"use client";

import { type IncomeSource, incomeSources, type IsoDate } from "@mizania/core";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { checkInAction, type CheckInActionResult } from "@/app/actions/checkin";
import { AmountDisplay, Keypad, useAmountEntry } from "@/components/amount/amount-entry";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useFormatAmount, useWalletName, type WalletView } from "@/components/wallets/shared";
import { useOnline } from "@/hooks/use-online";
import { useRouter } from "@/i18n/navigation";

import { useSincePhrase } from "./since";

type Step =
  | { name: "count" }
  | { name: "match" }
  | { name: "spent"; amountMillimes: number; since: string | null }
  | { name: "more"; amountMillimes: number; receiving: boolean }
  | { name: "added"; amountMillimes: number; nextWeek: boolean }
  | { name: "changed" };

const countErrors = [
  "invalid",
  "not-found",
  "not-latest",
  "wallet-archived",
  "signed-out",
  "server",
] as const;
type CountError = (typeof countErrors)[number];

/**
 * Counting one wallet (ADR 004): she types what's really in it, without
 * seeing what the app expects, and the difference is recorded. Counted more:
 * "did you receive money?" first (decision 6).
 */
export function CountSheet({
  wallet,
  today,
  onClose,
}: {
  wallet: Pick<WalletView, "id" | "type" | "name">;
  today: IsoDate;
  onClose: () => void;
}) {
  const t = useTranslations("Checkin");
  const r = useTranslations("Received");
  const todayT = useTranslations("Today");
  const router = useRouter();
  const online = useOnline();
  const walletName = useWalletName();
  const formatAmount = useFormatAmount();
  const sincePhrase = useSincePhrase();
  const entry = useAmountEntry();
  // One ID per count: a retry after a lost response saves it once.
  const [id, setId] = useState(() => crypto.randomUUID());
  const [step, setStep] = useState<Step>({ name: "count" });
  const [source, setSource] = useState<IncomeSource>("other");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<CountError | null>(null);
  const name = walletName(wallet);
  const counted = entry.amount;

  function send(answer?: { answer: "income" | "correction"; seenMillimes: number }) {
    if (counted === null) return;
    setError(null);
    startTransition(async () => {
      let result: CheckInActionResult;
      try {
        result = await checkInAction({
          id,
          walletId: wallet.id,
          countedMillimes: counted,
          ...(answer && {
            ...answer,
            ...(answer.answer === "income" && { source }),
          }),
        });
      } catch {
        result = { ok: false, error: "server" };
      }
      if (result.ok) {
        router.refresh();
        if (result.kind === "match") setStep({ name: "match" });
        else if (result.kind === "unlogged_spending") {
          setStep({ name: "spent", amountMillimes: result.amountMillimes, since: result.since });
        } else {
          setStep({
            name: "added",
            amountMillimes: result.amountMillimes,
            nextWeek: result.nextWeek,
          });
        }
        return;
      }
      if (result.error === "needs-answer") {
        setStep({ name: "more", amountMillimes: result.amountMillimes, receiving: false });
      } else if (result.error === "changed") {
        setId(crypto.randomUUID());
        setStep({ name: "changed" });
      } else {
        setError(countErrors.find((e) => e === result.error) ?? "server");
      }
    });
  }

  function countAgain() {
    setId(crypto.randomUUID());
    setStep({ name: "count" });
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        closeLabel={t("close")}
        className="gap-3"
        data-testid="count-sheet"
        {...(step.name === "count" ? entry.handlers : {})}
      >
        <DialogTitle>{t("title", { wallet: name })}</DialogTitle>

        {step.name === "count" || step.name === "changed" ? (
          <>
            {step.name === "changed" && (
              <p className="text-sm text-amber-700 dark:text-amber-300">{t("changed")}</p>
            )}
            <p className="text-center text-sm text-muted-foreground">{t("countedLabel")}</p>
            <AmountDisplay entry={entry} testId="count-amount" />
            <Keypad entry={entry} />
            <Button
              size="lg"
              disabled={counted === null || pending || !online}
              onClick={() => {
                send();
              }}
            >
              {pending ? t("saving") : t("done")}
            </Button>
          </>
        ) : (
          <div className="flex flex-col gap-3" data-testid="count-result" aria-live="polite">
            {step.name === "match" && <p>{t("match", { wallet: name })}</p>}
            {step.name === "spent" && (
              <>
                <p className="font-medium">
                  {t("spent", {
                    amount: formatAmount(step.amountMillimes),
                    since: sincePhrase(step.since, today),
                  })}
                </p>
                <p className="text-sm text-muted-foreground">{t("spentHint")}</p>
              </>
            )}
            {step.name === "added" && (
              <>
                <p className="font-medium">
                  {t("added", { amount: formatAmount(step.amountMillimes), wallet: name })}
                </p>
                {step.nextWeek && (
                  <p className="text-sm text-primary" data-testid="count-next-week">
                    {todayT("nextWeek", { amount: formatAmount(step.amountMillimes) })}
                  </p>
                )}
              </>
            )}
            {step.name === "more" && (
              <>
                <p className="font-medium">
                  {t("more", { amount: formatAmount(step.amountMillimes) })}
                </p>
                {step.receiving ? (
                  <fieldset className="flex flex-col gap-2">
                    <legend className="mb-2 text-sm">{t("sourceLabel")}</legend>
                    <div className="flex flex-wrap gap-2">
                      {incomeSources.map((s) => (
                        <label
                          key={s}
                          className="cursor-pointer rounded-full border px-3 py-1.5 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary has-[:checked]:text-primary-foreground"
                        >
                          <input
                            type="radio"
                            name="checkin-source"
                            className="sr-only"
                            checked={source === s}
                            onChange={() => {
                              setSource(s);
                            }}
                          />
                          {r(`sources.${s}`)}
                        </label>
                      ))}
                    </div>
                    <Button
                      size="lg"
                      disabled={pending || !online}
                      onClick={() => {
                        send({ answer: "income", seenMillimes: step.amountMillimes });
                      }}
                    >
                      {pending ? t("saving") : t("saveIncome")}
                    </Button>
                  </fieldset>
                ) : (
                  <div className="flex flex-col gap-2">
                    <Button
                      size="lg"
                      onClick={() => {
                        setStep({ ...step, receiving: true });
                      }}
                    >
                      {t("moreIncome")}
                    </Button>
                    <Button
                      size="lg"
                      variant="outline"
                      disabled={pending || !online}
                      onClick={() => {
                        send({ answer: "correction", seenMillimes: step.amountMillimes });
                      }}
                    >
                      {t("moreCorrection")}
                    </Button>
                  </div>
                )}
                <Button variant="ghost" onClick={countAgain}>
                  {t("countAgain")}
                </Button>
              </>
            )}
            {step.name !== "more" && (
              <Button size="lg" variant="outline" onClick={onClose}>
                {t("close")}
              </Button>
            )}
          </div>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {t(`errors.${error}`)}
          </p>
        )}
        {!online && <p className="text-sm text-muted-foreground">{t("offline")}</p>}
      </DialogContent>
    </Dialog>
  );
}
