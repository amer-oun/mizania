"use client";

import type { QuickLogOptions } from "@mizania/db/expenses";
import type { Plan, PlanFixedCost } from "@mizania/db/plan";
import { useTranslations } from "next-intl";
import { useCallback, useRef, useState } from "react";

import {
  markFixedCostPaidAction,
  payFixedCostAction,
  undoFixedCostPaymentAction,
} from "@/app/actions/fixed-costs";
import { Button } from "@/components/ui/button";
import { Snackbar, type SnackbarMessage } from "@/components/ui/snackbar";
import { useFormatAmount, useWalletAction } from "@/components/wallets/shared";
import { useOnline } from "@/hooks/use-online";

import { type Payment, PaySheet } from "./pay-sheet";
import { PlanScreen, usePlanItemName } from "./plan-screen";

/** The Plan screen with Pay and Undo on each fixed cost. */
export function PlanWithActions({
  plan,
  wallets,
  defaultWalletId,
}: {
  plan: Plan;
  wallets: QuickLogOptions["wallets"];
  defaultWalletId: string | null;
}) {
  const t = useTranslations("PayFixed");
  const nameOf = usePlanItemName();
  const formatAmount = useFormatAmount();
  const online = useOnline();
  const { pending, error, setError, run } = useWalletAction();
  const [paying, setPaying] = useState<PlanFixedCost | null>(null);
  // One ID per payment: a retry after a lost response doesn't save it twice.
  const [paymentId, setPaymentId] = useState(() => crypto.randomUUID());
  const [message, setMessage] = useState<SnackbarMessage | null>(null);
  const messages = useRef(0);
  const hide = useCallback(() => {
    setMessage(null);
  }, []);
  const show = (text: string, undoOf?: PlanFixedCost) => {
    setMessage({
      id: ++messages.current,
      text,
      action: undoOf && {
        label: t("undo"),
        run: () => {
          run(() => undoFixedCostPaymentAction({ planItemId: undoOf.id }));
        },
      },
    });
  };

  function pay(cost: PlanFixedCost, payment: Payment) {
    run(
      () => payFixedCostAction({ id: paymentId, planItemId: cost.id, ...payment }),
      () => {
        setPaying(null);
        setPaymentId(crypto.randomUUID());
        const name = nameOf(cost);
        show(
          payment.final
            ? t("paid", { name })
            : t("paidPart", { name, amount: formatAmount(payment.amountMillimes) }),
          cost,
        );
      },
    );
  }

  return (
    <>
      {error && !paying && (
        <p role="alert" className="mb-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <PlanScreen
        plan={plan}
        actions={(cost) =>
          cost.paid ? (
            <Button
              variant="ghost"
              size="sm"
              aria-label={t("undoLabel", { name: nameOf(cost) })}
              disabled={pending || !online}
              onClick={() => {
                run(
                  () => undoFixedCostPaymentAction({ planItemId: cost.id }),
                  () => {
                    show(t("undone"));
                  },
                );
              }}
            >
              {t("undo")}
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              aria-label={t("payLabel", { name: nameOf(cost) })}
              disabled={wallets.length === 0}
              onClick={() => {
                setError(null);
                setPaying(cost);
              }}
            >
              {t("pay")}
            </Button>
          )
        }
      />
      {paying && (
        <PaySheet
          cost={paying}
          name={nameOf(paying)}
          wallets={wallets}
          defaultWalletId={defaultWalletId}
          pending={pending}
          error={error}
          onOpenChange={(open) => {
            if (!open) setPaying(null);
          }}
          onPay={(payment) => {
            pay(paying, payment);
          }}
          onMarkPaid={() => {
            const cost = paying;
            run(
              () => markFixedCostPaidAction({ planItemId: cost.id }),
              () => {
                setPaying(null);
                show(t("markedPaid", { name: nameOf(cost) }), cost);
              },
            );
          }}
        />
      )}
      <Snackbar message={message} onClose={hide} />
    </>
  );
}
