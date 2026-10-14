"use client";

import type { IsoDate } from "@mizania/core";
import { useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";

import { moveExpectedDateAction } from "@/app/actions/received";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useOnline } from "@/hooks/use-online";
import { useRouter } from "@/i18n/navigation";
import type { WalletActionError } from "@/lib/wallet-action";

const dateErrors = ["invalid", "not-found", "wallet-archived", "signed-out", "server"] as const;
type DateError = (typeof dateErrors)[number];
const dateError = (error: WalletActionError): DateError =>
  dateErrors.find((e) => e === error) ?? "server";

/**
 * When the money is expected: "Not yet" on Today, or "Change" on the Plan
 * tab. `min` and `max` come from packages/core (canExpectOn).
 */
export function ExpectedDateSheet({
  cycleId,
  initial,
  min,
  max,
  onClose,
}: {
  cycleId: string;
  initial: IsoDate;
  min: IsoDate;
  max: IsoDate;
  onClose: () => void;
}) {
  const t = useTranslations("ExpectedDate");
  const router = useRouter();
  const online = useOnline();
  const inputId = useId();
  const [date, setDate] = useState<string>(initial);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<DateError | null>(null);
  const valid = date !== "" && date >= min && date <= max;

  function save() {
    setError(null);
    startTransition(async () => {
      let result: Awaited<ReturnType<typeof moveExpectedDateAction>>;
      try {
        result = await moveExpectedDateAction({ cycleId, expectedOn: date });
      } catch {
        result = { ok: false, error: "server" };
      }
      if (!result.ok) {
        setError(dateError(result.error));
        return;
      }
      onClose();
      router.refresh();
    });
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent closeLabel={t("close")} className="gap-4" data-testid="expected-date-sheet">
        <DialogTitle>{t("title")}</DialogTitle>
        <div className="flex flex-col gap-1">
          <label htmlFor={inputId} className="text-sm text-muted-foreground">
            {t("label")}
          </label>
          <input
            id={inputId}
            type="date"
            className="h-11 rounded-md border bg-background px-3"
            value={date}
            min={min}
            max={max}
            onChange={(e) => {
              setDate(e.target.value);
            }}
          />
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {t(`errors.${error}`)}
          </p>
        )}
        <Button size="lg" disabled={!valid || pending || !online} onClick={save}>
          {pending ? t("saving") : t("save")}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
