"use client";

import { formatTypedTND } from "@mizania/core";
import type { QuickLogOptions } from "@mizania/db/expenses";
import type { PlanFixedCost } from "@mizania/db/plan";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";

import { AmountDisplay, Keypad, useAmountEntry } from "@/components/amount/amount-entry";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useWalletName } from "@/components/wallets/shared";
import { useOnline } from "@/hooks/use-online";

export interface Payment {
  amountMillimes: number;
  walletId: string;
  final: boolean;
}

/**
 * Paying a fixed cost: the amount actually paid (pre-filled with what's left
 * to pay), the wallet, and "That's everything for this month" (on by
 * default; off to pay the rest later).
 */
export function PaySheet({
  cost,
  name,
  wallets,
  defaultWalletId,
  pending,
  error,
  onOpenChange,
  onPay,
  onMarkPaid,
}: {
  cost: PlanFixedCost;
  name: string;
  wallets: QuickLogOptions["wallets"];
  defaultWalletId: string | null;
  pending: boolean;
  error: string | null;
  onOpenChange: (open: boolean) => void;
  onPay: (payment: Payment) => void;
  onMarkPaid: () => void;
}) {
  const t = useTranslations("PayFixed");
  const q = useTranslations("QuickLog");
  const walletName = useWalletName();
  const online = useOnline();
  const walletSelectId = useId();
  const finalId = useId();
  const entry = useAmountEntry(cost.left > 0 ? formatTypedTND(cost.left) : "");
  const [walletId, setWalletId] = useState(cost.lastWalletId ?? defaultWalletId ?? "");
  const [final, setFinal] = useState(true);
  const ready = entry.amount !== null && entry.amount > 0 && walletId !== "" && online && !pending;

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent
        closeLabel={t("close")}
        className="gap-3"
        data-testid="pay-sheet"
        {...entry.handlers}
      >
        <DialogTitle>{t("title", { name })}</DialogTitle>
        <p className="text-center text-sm text-muted-foreground">{t("amount")}</p>
        <AmountDisplay entry={entry} testId="pay-amount" />
        <Keypad entry={entry} />

        <div className="flex items-center gap-2 text-sm">
          <label htmlFor={walletSelectId} className="text-muted-foreground">
            {q("from")}
          </label>
          <select
            id={walletSelectId}
            className="h-9 rounded-md border bg-background px-2"
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

        <div className="flex flex-col gap-1">
          <label htmlFor={finalId} className="flex min-h-11 items-center gap-3 text-sm">
            <input
              id={finalId}
              type="checkbox"
              className="size-5 accent-primary"
              checked={final}
              onChange={(e) => {
                setFinal(e.target.checked);
              }}
            />
            {t("final")}
          </label>
          <p className="text-xs text-muted-foreground">{t("finalHint")}</p>
        </div>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {!online && <p className="text-sm text-muted-foreground">{q("offline")}</p>}
        <Button
          size="lg"
          disabled={!ready}
          onClick={() => {
            if (entry.amount !== null) onPay({ amountMillimes: entry.amount, walletId, final });
          }}
        >
          {pending ? t("saving") : t("confirm")}
        </Button>
        {cost.paidSoFar > 0 && (
          <Button variant="ghost" disabled={pending || !online} onClick={onMarkPaid}>
            {t("markPaid")}
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}
