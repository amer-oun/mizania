"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState } from "react";

import { undoExtraMoneyAction } from "@/app/actions/received";
import { Snackbar } from "@/components/ui/snackbar";
import { useFormatAmount } from "@/components/wallets/shared";
import { useRouter } from "@/i18n/navigation";

const errorKeys = ["invalid", "not-found", "wallet-archived", "signed-out", "server"] as const;
const errorKey = (error: string) => errorKeys.find((e) => e === error) ?? "server";

/**
 * "50 DT added", with Undo, after extra money (Today's ?received=<id>).
 * Always rendered by Today, so it stays on screen while Today refreshes
 * after the undo.
 */
export function ReceivedSnackbar({
  received,
}: {
  /** `nextWeek`: weekly mode, and this week's amount doesn't include it. */
  received: { id: string; amountMillimes: number; nextWeek: boolean } | null;
}) {
  const t = useTranslations("Received");
  const today = useTranslations("Today");
  const router = useRouter();
  const formatAmount = useFormatAmount();
  const [shown, setShown] = useState<{ id: string; text: string; undo: boolean } | null>(
    () =>
      received && {
        id: received.id,
        text: received.nextWeek
          ? today("nextWeek", { amount: formatAmount(received.amountMillimes) })
          : t("added", { amount: formatAmount(received.amountMillimes) }),
        undo: true,
      },
  );

  // A reload shouldn't offer the undo again.
  useEffect(() => {
    if (received) window.history.replaceState(null, "", window.location.pathname);
  }, [received]);

  const message = useMemo(
    () =>
      shown && {
        id: shown.undo ? 1 : 2,
        text: shown.text,
        action: shown.undo
          ? {
              label: t("undo"),
              run: () => {
                void undoExtraMoneyAction({ id: shown.id }).then((result) => {
                  setShown({
                    id: shown.id,
                    text: result.ok ? t("undone") : t(`errors.${errorKey(result.error)}`),
                    undo: false,
                  });
                  router.refresh();
                });
              },
            }
          : undefined,
      },
    [shown, t, router],
  );
  // Tapping Undo closes it too; the result shows when the undo is done.
  const hide = useCallback(() => {
    setShown(null);
  }, []);

  return <Snackbar message={message} onClose={hide} />;
}
