"use client";

import type { QuickLogOptions } from "@mizania/db/expenses";
import { PlusIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { type ComponentProps, useCallback, useState } from "react";

import { deleteExpenseAction, logExpenseAction } from "@/app/actions/expenses";
import { Snackbar, type SnackbarMessage } from "@/components/ui/snackbar";
import { useFormatAmount, useWalletAction } from "@/components/wallets/shared";

import { type QuickLogEntry, QuickLogSheet } from "./quick-log-sheet";
import { TodayList } from "./today-list";

/** Lets the list under the number show a message in the same snackbar. */
export type ShowMessage = (message: Omit<SnackbarMessage, "id">) => void;

/**
 * Today's list, the "+" button, the quick log sheet, and the snackbar that
 * confirms a save or a delete (with Undo).
 */
export function TodayLog({
  options,
  list,
}: {
  options: QuickLogOptions;
  /** Null without an active cycle: no list then. */
  list: Omit<ComponentProps<typeof TodayList>, "show"> | null;
}) {
  const t = useTranslations("QuickLog");
  const locale = useLocale();
  const formatAmount = useFormatAmount();
  const { pending, error, setError, run } = useWalletAction();
  const [open, setOpen] = useState(false);
  // One ID per expense: a retry after a lost response doesn't save it twice.
  const [id, setId] = useState(() => crypto.randomUUID());
  const [message, setMessage] = useState<SnackbarMessage | null>(null);

  const show = useCallback<ShowMessage>((next) => {
    setMessage({ ...next, id: Date.now() });
  }, []);
  const hide = useCallback(() => {
    setMessage(null);
  }, []);

  function save(entry: QuickLogEntry) {
    const expenseId = id;
    run(
      () =>
        logExpenseAction({
          id: expenseId,
          amountMillimes: entry.amountMillimes,
          categoryId: entry.category.id,
          walletId: entry.walletId,
        }),
      () => {
        setOpen(false);
        setId(crypto.randomUUID());
        show({
          text: t("saved", {
            category: entry.category.names[locale],
            amount: formatAmount(entry.amountMillimes),
          }),
          action: {
            label: t("undo"),
            run: () => {
              run(() => deleteExpenseAction({ transactionId: expenseId }));
            },
          },
        });
      },
    );
  }

  return (
    <>
      {list && (
        <div className="mt-6">
          <TodayList {...list} show={show} />
        </div>
      )}
      {options.wallets.length > 0 && (
        <button
          type="button"
          aria-label={t("title")}
          className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] end-[max(1rem,calc(50vw-14rem+1rem))] z-30 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          data-testid="quick-log-open"
          onClick={() => {
            setError(null);
            setOpen(true);
          }}
        >
          <PlusIcon className="size-7" aria-hidden />
        </button>
      )}
      {open && (
        <QuickLogSheet
          open
          onOpenChange={setOpen}
          options={options}
          pending={pending}
          error={error}
          onSave={save}
        />
      )}
      <Snackbar message={message} onClose={hide} />
    </>
  );
}
