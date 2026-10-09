"use client";

import { formatTND, millimesReading, parseTND } from "@mizania/core";
import { DeleteIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { type ClipboardEvent, type KeyboardEvent, useState } from "react";

// Typing an amount on the app's own keypad (quick log, paying a fixed cost).
// Amounts are dinars; "Did you mean 2.500 DT?" offers the millimes reading of
// a whole number of 1000 or more (packages/core millimesReading).

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

export type AmountEntry = ReturnType<typeof useAmountEntry>;

/** The typed amount and how to change it. `initial` pre-fills it (e.g. "250"). */
export function useAmountEntry(initial = "") {
  const [typed, setTyped] = useState(initial);
  // "Did you mean 2.500 DT?" accepted: the typed digits are millimes.
  const [asMillimes, setAsMillimes] = useState(false);
  const reading = millimesReading(typed);

  function press(key: string) {
    setAsMillimes(false);
    setTyped((current) => typeKey(current, key));
  }

  return {
    typed,
    asMillimes,
    reading,
    /** In millimes, or null while what's typed isn't an amount. */
    amount: asMillimes ? reading : parseTND(typed),
    press,
    acceptMillimes: () => {
      setAsMillimes(true);
    },
    /** For the dialog around the keypad: a physical keyboard and paste work too. */
    handlers: {
      onKeyDown: (e: KeyboardEvent) => {
        if (e.target instanceof HTMLSelectElement || e.target instanceof HTMLInputElement) return;
        const key = e.key === "Backspace" ? "back" : e.key;
        if (key === "back" || /^[0-9٠-٩.,٫]$/.test(key)) {
          e.preventDefault();
          press(key);
        }
      },
      onPaste: (e: ClipboardEvent) => {
        e.preventDefault();
        setAsMillimes(false);
        let next = "";
        for (const key of e.clipboardData.getData("text").trim()) next = typeKey(next, key);
        setTyped(next);
      },
    },
  };
}

/** The amount as typed, large, with the "Did you mean…" chip. */
export function AmountDisplay({ entry, testId }: { entry: AmountEntry; testId?: string }) {
  const t = useTranslations("QuickLog");
  const locale = useLocale();
  const { typed, asMillimes, amount, reading } = entry;

  return (
    // Numbers read left to right in every language.
    <div className="flex flex-col items-center gap-1" dir="ltr">
      <output
        aria-label={t("amount")}
        className="text-4xl font-bold tabular-nums"
        data-testid={testId}
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
          onClick={entry.acceptMillimes}
        >
          {t("didYouMean", { amount: formatTND(reading, locale) })}
        </button>
      )}
    </div>
  );
}

const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "back"] as const;

/** Digits, a decimal key and delete, laid out like a phone keypad. */
export function Keypad({ entry }: { entry: AmountEntry }) {
  const t = useTranslations("QuickLog");
  return (
    <div className="grid grid-cols-3 gap-2" dir="ltr">
      {keys.map((key) => (
        <button
          key={key}
          type="button"
          className="flex h-12 items-center justify-center rounded-md bg-muted text-xl font-medium active:bg-accent"
          aria-label={key === "back" ? t("back") : key === "." ? t("decimal") : undefined}
          onClick={() => {
            entry.press(key);
          }}
        >
          {key === "back" ? <DeleteIcon className="size-5" aria-hidden /> : key}
        </button>
      ))}
    </div>
  );
}
