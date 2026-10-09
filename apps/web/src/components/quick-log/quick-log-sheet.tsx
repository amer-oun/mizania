"use client";

import { formatTND, millimesReading, parseTND } from "@mizania/core";
import type { QuickLogOptions } from "@mizania/db/expenses";
import { DeleteIcon, MailIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useId, useState } from "react";

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

const MAX_DINAR_DIGITS = 7;
const MAX_MILLIME_DIGITS = 3;

/**
 * Adds one key to what's typed: a digit (0–9 or ٠–٩), a decimal separator
 * (".", ",", "٫") or "back". Ignores keys that would make it invalid.
 */
export function typeKey(typed: string, key: string): string {
  if (key === "back") return typed.slice(0, -1);
  const digit = /^[٠-٩]$/.test(key) ? String(key.charCodeAt(0) - 0x0660) : key;
  const [dinars = "", millimes] = typed.split(".");
  if ([".", ",", "٫"].includes(digit)) {
    return millimes === undefined ? `${dinars === "" ? "0" : dinars}.` : typed;
  }
  if (!/^[0-9]$/.test(digit)) return typed;
  if (millimes !== undefined) {
    return millimes.length < MAX_MILLIME_DIGITS ? typed + digit : typed;
  }
  if (dinars === "0") return digit; // no leading zeros
  return dinars.length < MAX_DINAR_DIGITS ? typed + digit : typed;
}

const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "back"] as const;

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
  const [typed, setTyped] = useState("");
  // "Did you mean 2.500 DT?" accepted: the typed digits are millimes.
  const [asMillimes, setAsMillimes] = useState(false);
  // Null: the category's last wallet, else the default one.
  const [chosenWallet, setChosenWallet] = useState<string | null>(null);

  const reading = millimesReading(typed);
  const amount = asMillimes ? reading : parseTND(typed);
  const ready = amount !== null && amount > 0 && online && !pending;
  const shownWallet = chosenWallet ?? options.defaultWalletId;

  function press(key: string) {
    setAsMillimes(false);
    setTyped((current) => typeKey(current, key));
  }

  function reset(next: boolean) {
    if (!next) {
      setTyped("");
      setAsMillimes(false);
      setChosenWallet(null);
    }
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={reset}>
      <DialogContent
        closeLabel={t("close")}
        className="gap-3"
        data-testid="quick-log"
        onKeyDown={(e) => {
          if (e.target instanceof HTMLSelectElement) return;
          const key = e.key === "Backspace" ? "back" : e.key;
          if (key === "back" || /^[0-9٠-٩.,٫]$/.test(key)) {
            e.preventDefault();
            press(key);
          }
        }}
        onPaste={(e) => {
          e.preventDefault();
          setAsMillimes(false);
          let next = "";
          for (const key of e.clipboardData.getData("text").trim()) next = typeKey(next, key);
          setTyped(next);
        }}
      >
        <DialogTitle>{t("title")}</DialogTitle>

        {/* Numbers read left to right in every language. */}
        <div className="flex flex-col items-center gap-1" dir="ltr">
          <output
            aria-label={t("amount")}
            className="text-4xl font-bold tabular-nums"
            data-testid="quick-log-amount"
          >
            {asMillimes && amount !== null
              ? formatTND(amount, locale)
              : `${typed === "" ? "0" : typed} ${t("currency")}`}
          </output>
          {!asMillimes && amount !== null && typed.includes(".") && (
            <span className="text-sm text-muted-foreground">{formatTND(amount, locale)}</span>
          )}
          {!asMillimes && reading !== null && (
            <button
              type="button"
              className="rounded-full border border-primary px-3 py-1 text-sm text-primary"
              onClick={() => {
                setAsMillimes(true);
              }}
            >
              {t("didYouMean", { amount: formatTND(reading, locale) })}
            </button>
          )}
        </div>

        <div className="grid grid-cols-3 gap-2" dir="ltr">
          {keys.map((key) => (
            <button
              key={key}
              type="button"
              className="flex h-12 items-center justify-center rounded-md bg-muted text-xl font-medium active:bg-accent"
              aria-label={key === "back" ? t("back") : key === "." ? t("decimal") : undefined}
              onClick={() => {
                press(key);
              }}
            >
              {key === "back" ? <DeleteIcon className="size-5" aria-hidden /> : key}
            </button>
          ))}
        </div>

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
