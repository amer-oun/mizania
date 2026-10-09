"use client";

import type { TransferRow } from "@mizania/db/wallets";
import { useFormatter, useTranslations } from "next-intl";

import { undoTransferAction } from "@/app/actions/transfers";
import { Button } from "@/components/ui/button";
import { useOnline } from "@/hooks/use-online";

import { Amount, useWalletAction, useWalletName, type WalletView } from "./shared";

/** The latest transfers, each with Undo (a soft delete). */
export function RecentTransfers({
  transfers,
  wallets,
}: {
  transfers: readonly TransferRow[];
  /** All wallets, archived ones too, to name both ends of each transfer. */
  wallets: readonly WalletView[];
}) {
  const t = useTranslations("Wallets");
  const format = useFormatter();
  const walletName = useWalletName();
  const online = useOnline();
  const { pending, error, run } = useWalletAction();
  const byId = new Map(wallets.map((w) => [w.id, w]));
  const nameOf = (id: string) => {
    const wallet = byId.get(id);
    return wallet ? walletName(wallet) : "?";
  };

  return (
    <section aria-labelledby="recent-transfers" className="flex flex-col gap-2">
      <h2 id="recent-transfers" className="text-sm font-medium text-muted-foreground">
        {t("recentTitle")}
      </h2>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {transfers.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("noTransfers")}</p>
      ) : (
        <ul className="flex flex-col divide-y rounded-xl border" data-testid="recent-transfers">
          {transfers.map((transfer) => {
            // An archived wallet stays at 0, so its transfers can't be undone.
            const locked = [transfer.fromWalletId, transfer.toWalletId].some(
              (id) => byId.get(id)?.archived ?? true,
            );
            return (
              <li
                key={transfer.id}
                className="flex min-h-16 items-center gap-3 px-4 py-2"
                data-testid="transfer"
              >
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium">
                    {t("transferLine", {
                      from: nameOf(transfer.fromWalletId),
                      to: nameOf(transfer.toWalletId),
                    })}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {format.dateTime(transfer.occurredAt, {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                    {transfer.note && ` · ${transfer.note}`}
                  </span>
                </div>
                <Amount millimes={transfer.amountMillimes} className="text-sm font-semibold" />
                {!locked && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={pending || !online}
                    onClick={() => {
                      run(() => undoTransferAction({ transferId: transfer.id }));
                    }}
                  >
                    {t("undo")}
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
