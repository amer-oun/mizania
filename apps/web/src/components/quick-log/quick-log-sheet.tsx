"use client";

import type { QuickLogOptions } from "@mizania/db/expenses";
import { MailIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useId, useState } from "react";

import { AmountDisplay, Keypad, useAmountEntry } from "@/components/amount/amount-entry";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useWalletName } from "@/components/wallets/shared";
import { useOnline } from "@/hooks/use-online";
import { cn } from "@/lib/utils";

import { CategoryIcon } from "./category-icon";

export type QuickLogCategory = QuickLogOptions["categories"][number];

/** What the sheet saves: everything but the client ID. */
export interface QuickLogEntry {
  amountMillimes: number;
  category: QuickLogCategory;
  walletId: string;
}

/**
 * The quick log sheet: amount on a keypad, then one tap on a category saves
 * it. The wallet is cash by default, or the one last used for the category.
 */
export function QuickLogSheet({
  open,
  onOpenChange,
  options,
  pending,
  error,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  options: QuickLogOptions;
  pending: boolean;
  error: string | null;
  onSave: (entry: QuickLogEntry) => void;
}) {
  const t = useTranslations("QuickLog");
  const locale = useLocale();
  const walletName = useWalletName();
  const online = useOnline();
  const walletSelectId = useId();
  const entry = useAmountEntry();
  // Null: the category's last wallet, else the default one.
  const [chosenWallet, setChosenWallet] = useState<string | null>(null);

  const { amount } = entry;
  const ready = amount !== null && amount > 0 && online && !pending;
  const shownWallet = chosenWallet ?? options.defaultWalletId;

  // The parent mounts the sheet each time it opens, so it starts empty.

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        closeLabel={t("close")}
        className="gap-3"
        data-testid="quick-log"
        {...entry.handlers}
      >
        <DialogTitle>{t("title")}</DialogTitle>

        <AmountDisplay entry={entry} testId="quick-log-amount" />
        <Keypad entry={entry} />

        <div className="flex items-center gap-2 text-sm">
          <label htmlFor={walletSelectId} className="text-muted-foreground">
            {t("from")}
          </label>
          <select
            id={walletSelectId}
            className="h-9 rounded-md border bg-background px-2"
            value={shownWallet ?? ""}
            onChange={(e) => {
              setChosenWallet(e.target.value);
            }}
          >
            {options.wallets.map((w) => (
              <option key={w.id} value={w.id}>
                {walletName(w)}
              </option>
            ))}
          </select>
        </div>

        <p className="text-sm text-muted-foreground">{t("pickCategory")}</p>
        <div className="grid grid-cols-3 gap-2" data-testid="quick-log-categories">
          {options.categories.map((category) => (
            <button
              key={category.id}
              type="button"
              disabled={!ready}
              className={cn(
                "relative flex min-h-16 flex-col items-center justify-center gap-1 rounded-md border px-1 py-2 text-xs",
                "disabled:opacity-40",
              )}
              onClick={() => {
                if (amount === null) return;
                const walletId = chosenWallet ?? category.lastWalletId ?? options.defaultWalletId;
                if (walletId) onSave({ amountMillimes: amount, category, walletId });
              }}
            >
              <CategoryIcon name={category.icon} />
              <span className="line-clamp-2 text-center">{category.names[locale]}</span>
              {category.envelope && (
                <MailIcon
                  className="absolute end-1 top-1 size-3 text-muted-foreground"
                  aria-label={t("envelope")}
                />
              )}
            </button>
          ))}
        </div>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {!online && <p className="text-sm text-muted-foreground">{t("offline")}</p>}
      </DialogContent>
    </Dialog>
  );
}
