"use client";

import type { IsoDate } from "@mizania/core";
import type { CheckinState, CheckinWallet, LastCount } from "@mizania/db/checkin";
import { CheckIcon, MoonIcon } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useState, useSyncExternalStore, useTransition } from "react";

import { undoCheckInAction } from "@/app/actions/checkin";
import { Button } from "@/components/ui/button";
import { useFormatAmount, useWalletName } from "@/components/wallets/shared";
import { useOnline } from "@/hooks/use-online";
import { Link, useRouter } from "@/i18n/navigation";

import { CountSheet } from "./count-sheet";

// "Not tonight" is remembered on this phone only, until the next day.
const DISMISSED_KEY = "mizania.checkin.dismissed";
const DISMISSED_EVENT = "mizania-checkin-dismissed";

function readDismissed(): string | null {
  try {
    return localStorage.getItem(DISMISSED_KEY);
  } catch {
    return null;
  }
}
function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(DISMISSED_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(DISMISSED_EVENT, onChange);
  };
}

/** "matches", "8 DT unlogged" or "+5 DT": what a count found. */
function useCountResult() {
  const t = useTranslations("Checkin");
  const formatAmount = useFormatAmount();
  return (last: LastCount) =>
    last.kind === "match"
      ? t("resultMatch")
      : last.kind === "unlogged_spending"
        ? t("resultSpent", { amount: formatAmount(last.amountMillimes) })
        : t("resultMore", { amount: formatAmount(last.amountMillimes) });
}

const undoErrors = ["not-found", "not-latest", "wallet-archived", "signed-out", "server"] as const;

/** Undo of a wallet's latest count. */
function useUndoCount() {
  const t = useTranslations("Checkin");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  function undo(last: LastCount) {
    setError(null);
    startTransition(async () => {
      const result = await undoCheckInAction({ id: last.id }).catch(() => ({
        ok: false as const,
        error: "server" as const,
      }));
      if (!result.ok) {
        setError(t(`errors.${undoErrors.find((e) => e === result.error) ?? "server"}`));
        return;
      }
      router.refresh();
    });
  }
  return { undo, pending, error };
}

/**
 * Today's evening check-in card: from 18:00 (or the student's earlier
 * check-in time) until she counts her cash or says "Not tonight". Once
 * counted, one line with Undo and "Count again".
 */
export function CheckinCard({ state, today }: { state: CheckinState; today: IsoDate }) {
  const t = useTranslations("Checkin");
  const format = useFormatter();
  const online = useOnline();
  const resultOf = useCountResult();
  const { undo, pending, error } = useUndoCount();
  const [counting, setCounting] = useState(false);
  const dismissed = useSyncExternalStore(
    subscribe,
    () => readDismissed() === today,
    () => false,
  );
  const cash = state.wallets.find((w) => w.id === state.cashWalletId);
  if (!cash) return null;
  const sheet = counting && (
    <CountSheet
      wallet={cash}
      today={today}
      onClose={() => {
        setCounting(false);
      }}
    />
  );

  if (state.cashCountedToday && cash.last) {
    const last = cash.last;
    return (
      <section
        className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border px-4 py-3 text-sm"
        data-testid="checkin-done"
      >
        <CheckIcon className="size-4 text-primary" aria-hidden />
        <span className="flex-1">
          {t("doneLine", {
            time: format.dateTime(last.at, {
              hour: "2-digit",
              minute: "2-digit",
              timeZone: "Africa/Tunis",
            }),
          })}{" "}
          · {resultOf(last)}
        </span>
        <Button
          variant="ghost"
          size="sm"
          disabled={pending || !online}
          onClick={() => {
            undo(last);
          }}
        >
          {t("undo")}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setCounting(true);
          }}
        >
          {t("countAgain")}
        </Button>
        {error && (
          <p role="alert" className="w-full text-destructive">
            {error}
          </p>
        )}
        {sheet}
      </section>
    );
  }

  if (!state.evening || dismissed) return null;
  return (
    <section
      aria-labelledby="checkin-title"
      className="flex flex-col gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4"
      data-testid="checkin-card"
    >
      <h2 id="checkin-title" className="flex items-center gap-2 font-semibold">
        <MoonIcon className="size-4 text-primary" aria-hidden />
        {t("cardTitle")}
      </h2>
      <p className="text-sm text-muted-foreground">{t("cardText")}</p>
      <div className="flex gap-2">
        <Button
          className="flex-1"
          onClick={() => {
            setCounting(true);
          }}
        >
          {t("countCash")}
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            try {
              localStorage.setItem(DISMISSED_KEY, today);
            } catch {
              // Private mode: it shows again on the next visit.
            }
            window.dispatchEvent(new Event(DISMISSED_EVENT));
          }}
        >
          {t("notTonight")}
        </Button>
      </div>
      <Link
        href="/checkin"
        className="self-start text-sm text-primary underline-offset-4 hover:underline"
      >
        {t("checkAll")}
      </Link>
      {sheet}
    </section>
  );
}

/** Every active wallet, with its last count and a Count button (/checkin). */
export function CheckinWallets({
  state,
  today,
  openWalletId,
}: {
  state: CheckinState;
  today: IsoDate;
  /** Opens the count of this wallet at once (Wallets tab, "Count my cash"). */
  openWalletId: string | null;
}) {
  const t = useTranslations("Checkin");
  const format = useFormatter();
  const online = useOnline();
  const walletName = useWalletName();
  const resultOf = useCountResult();
  const { undo, pending, error } = useUndoCount();
  const [counting, setCounting] = useState<CheckinWallet | null>(
    () => state.wallets.find((w) => w.id === openWalletId) ?? null,
  );

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">{t("pageHint")}</p>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <ul className="flex flex-col divide-y rounded-xl border">
        {state.wallets.map((wallet) => (
          <li
            key={wallet.id}
            className="flex min-h-16 items-center gap-3 px-4 py-2"
            data-testid="checkin-wallet"
          >
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-sm font-medium">{walletName(wallet)}</span>
              <span className="truncate text-xs text-muted-foreground">
                {wallet.last
                  ? `${t("lastCount", {
                      when: format.dateTime(wallet.last.at, {
                        weekday: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                        timeZone: "Africa/Tunis",
                      }),
                    })} · ${resultOf(wallet.last)}`
                  : t("neverCounted")}
              </span>
            </div>
            {wallet.last?.day === today && (
              <Button
                variant="ghost"
                size="sm"
                disabled={pending || !online}
                onClick={() => {
                  if (wallet.last) undo(wallet.last);
                }}
              >
                {t("undo")}
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              aria-label={t("countLabel", { wallet: walletName(wallet) })}
              onClick={() => {
                setCounting(wallet);
              }}
            >
              {t("count")}
            </Button>
          </li>
        ))}
      </ul>
      {counting && (
        <CountSheet
          wallet={counting}
          today={today}
          onClose={() => {
            setCounting(null);
          }}
        />
      )}
    </div>
  );
}
