"use client";

import type { TodayExpense } from "@mizania/db/budget";
import type { CategoryOption } from "@mizania/db/expenses";
import { Trash2Icon } from "lucide-react";
import { useFormatter, useLocale, useTranslations } from "next-intl";

import { deleteExpenseAction, restoreExpenseAction } from "@/app/actions/expenses";
import { Button } from "@/components/ui/button";
import {
  Amount,
  useFormatAmount,
  useWalletAction,
  useWalletName,
  type WalletView,
} from "@/components/wallets/shared";
import { useOnline } from "@/hooks/use-online";

import { CategoryIcon } from "./category-icon";
import type { ShowMessage } from "./today-log";

/** Today's expenses under the number, newest first. */
export function TodayList({
  expenses,
  categories,
  wallets,
  show,
}: {
  expenses: readonly TodayExpense[];
  categories: readonly CategoryOption[];
  /** All wallets, archived ones too, to name each expense's wallet. */
  wallets: readonly WalletView[];
  show: ShowMessage;
}) {
  const t = useTranslations("TodayList");
  const q = useTranslations("QuickLog");
  const locale = useLocale();
  const format = useFormatter();
  const formatAmount = useFormatAmount();
  const walletName = useWalletName();
  const online = useOnline();
  const { pending, error, run } = useWalletAction();
  const categoryOf = new Map(categories.map((c) => [c.id, c]));
  const walletOf = new Map(wallets.map((w) => [w.id, w]));

  function remove(expense: TodayExpense) {
    run(
      () => deleteExpenseAction({ transactionId: expense.id }),
      () => {
        show({
          text: q("deleted"),
          action: {
            label: q("undo"),
            run: () => {
              run(() => restoreExpenseAction({ transactionId: expense.id }));
            },
          },
        });
      },
    );
  }

  return (
    <section aria-labelledby="today-list" className="flex flex-col gap-2">
      <h2 id="today-list" className="text-sm font-medium text-muted-foreground">
        {t("title")}
      </h2>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {expenses.length === 0 ? (
        <p className="text-sm text-muted-foreground" data-testid="today-list-empty">
          {t("empty")}
        </p>
      ) : (
        <ul className="flex flex-col divide-y rounded-xl border" data-testid="today-list">
          {expenses.map((expense) => {
            const category = expense.categoryId ? categoryOf.get(expense.categoryId) : undefined;
            const wallet = walletOf.get(expense.walletId);
            // Only quick-log expenses are deleted here (fixed costs and
            // check-ins are undone where they were made), and never in an
            // archived wallet, which must stay at 0.
            const deletable =
              expense.source === "quick" && wallet !== undefined && !wallet.archived;
            return (
              <li
                key={expense.id}
                className="flex min-h-16 items-center gap-3 px-4 py-2"
                data-testid="today-expense"
              >
                <CategoryIcon name={category?.icon ?? ""} className="text-muted-foreground" />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium">
                    {category ? category.names[locale] : t("unlogged")}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {wallet ? walletName(wallet) : ""} ·{" "}
                    {format.dateTime(expense.occurredAt, { hour: "2-digit", minute: "2-digit" })}
                  </span>
                  {expense.dailyPart < expense.amountMillimes && (
                    <span className="text-xs text-primary" data-testid="expense-plan-tag">
                      {expense.dailyPart === 0
                        ? t("covered")
                        : t("partial", { amount: formatAmount(expense.dailyPart) })}
                    </span>
                  )}
                </div>
                <Amount millimes={expense.amountMillimes} className="text-sm font-semibold" />
                {deletable && (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t("delete", {
                      category: category ? category.names[locale] : "",
                      amount: formatAmount(expense.amountMillimes),
                    })}
                    disabled={pending || !online}
                    onClick={() => {
                      remove(expense);
                    }}
                  >
                    <Trash2Icon />
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
