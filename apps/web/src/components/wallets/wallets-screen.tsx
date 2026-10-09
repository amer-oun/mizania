"use client";

import { totalBalance } from "@mizania/core";
import {
  ArchiveIcon,
  ArrowDownIcon,
  ArrowLeftRightIcon,
  ArrowUpIcon,
  BanknoteIcon,
  EllipsisVerticalIcon,
  PencilIcon,
  PlusIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { type ReactNode, useState } from "react";

import { moveWalletAction, restoreWalletAction } from "@/app/actions/wallets";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useOnline } from "@/hooks/use-online";
import { Link } from "@/i18n/navigation";

import { Amount, useWalletAction, useWalletName, WalletTypeIcon,type WalletView } from "./shared";
import { AddWalletDialog, ArchiveWalletDialog, RenameWalletDialog } from "./wallet-dialogs";

type OpenDialog =
  | { kind: "add" }
  | { kind: "rename"; wallet: WalletView }
  | { kind: "archive"; wallet: WalletView }
  | null;

/** Wallet types a cash withdrawal can come from. */
const withdrawable = new Set(["card", "d17", "flouci"]);

export function WalletsScreen({
  wallets,
  children,
}: {
  wallets: readonly WalletView[];
  /** Below the list: the recent transfers. */
  children?: ReactNode;
}) {
  const t = useTranslations("Wallets");
  const walletName = useWalletName();
  const online = useOnline();
  const { pending, error, run } = useWalletAction();
  const [dialog, setDialog] = useState<OpenDialog>(null);

  const active = wallets.filter((w) => !w.archived);
  const archived = wallets.filter((w) => w.archived);
  const cash = active.find((w) => w.type === "cash");
  const close = (open: boolean) => {
    if (!open) setDialog(null);
  };

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="wallets-total" className="rounded-xl bg-primary/10 p-4 text-center">
        <h2 id="wallets-total" className="text-sm text-muted-foreground">
          {t("total")}
        </h2>
        <Amount
          millimes={totalBalance(active.map((w) => w.balanceMillimes))}
          className="block text-3xl font-bold"
        />
        <p className="mt-1 text-xs text-muted-foreground">{t("totalHint")}</p>
      </section>

      <div className="flex gap-2">
        <Button asChild size="lg" className="flex-1">
          <Link href="/wallets/transfer">
            <ArrowLeftRightIcon />
            {t("transfer")}
          </Link>
        </Button>
        <Button
          size="lg"
          variant="outline"
          className="flex-1"
          onClick={() => {
            setDialog({ kind: "add" });
          }}
        >
          <PlusIcon />
          {t("add")}
        </Button>
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {!online && <p className="text-sm text-muted-foreground">{t("offline")}</p>}

      <ul className="flex flex-col divide-y rounded-xl border" data-testid="wallet-list">
        {active.map((wallet, index) => {
          const name = walletName(wallet);
          const move = (direction: "up" | "down") => {
            run(() => moveWalletAction({ walletId: wallet.id, direction }));
          };
          return (
            <li
              key={wallet.id}
              className="flex min-h-16 items-center gap-3 px-4"
              data-testid="wallet"
            >
              <WalletTypeIcon type={wallet.type} className="text-muted-foreground" />
              <span className="flex-1 truncate font-medium" data-testid="wallet-name">
                {name}
              </span>
              <Amount
                millimes={wallet.balanceMillimes}
                className="font-semibold"
                data-testid="wallet-balance"
              />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t("options", { name })}
                    disabled={pending}
                  >
                    <EllipsisVerticalIcon />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {cash && withdrawable.has(wallet.type) && (
                    <DropdownMenuItem asChild>
                      <Link
                        href={{
                          pathname: "/wallets/transfer",
                          query: { from: wallet.id, to: cash.id },
                        }}
                      >
                        <BanknoteIcon />
                        {t("withdraw")}
                      </Link>
                    </DropdownMenuItem>
                  )}
                  {wallet.type === "other" && (
                    <DropdownMenuItem
                      onSelect={() => {
                        setDialog({ kind: "rename", wallet });
                      }}
                    >
                      <PencilIcon />
                      {t("rename")}
                    </DropdownMenuItem>
                  )}
                  {index > 0 && (
                    <DropdownMenuItem
                      disabled={!online}
                      onSelect={() => {
                        move("up");
                      }}
                    >
                      <ArrowUpIcon />
                      {t("moveUp")}
                    </DropdownMenuItem>
                  )}
                  {index < active.length - 1 && (
                    <DropdownMenuItem
                      disabled={!online}
                      onSelect={() => {
                        move("down");
                      }}
                    >
                      <ArrowDownIcon />
                      {t("moveDown")}
                    </DropdownMenuItem>
                  )}
                  {active.length > 1 && (
                    <DropdownMenuItem
                      onSelect={() => {
                        setDialog({ kind: "archive", wallet });
                      }}
                    >
                      <ArchiveIcon />
                      {t("archive")}
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
          );
        })}
      </ul>

      {children}

      {archived.length > 0 && (
        <details className="group rounded-xl border">
          <summary className="flex min-h-12 cursor-pointer items-center px-4 text-sm font-medium">
            {t("archived", { count: archived.length })}
          </summary>
          <ul className="flex flex-col divide-y border-t">
            {archived.map((wallet) => (
              <li key={wallet.id} className="flex min-h-14 items-center gap-3 px-4">
                <WalletTypeIcon type={wallet.type} className="text-muted-foreground" />
                <span className="flex-1 truncate text-muted-foreground">{walletName(wallet)}</span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pending || !online}
                  onClick={() => {
                    run(() => restoreWalletAction({ walletId: wallet.id }));
                  }}
                >
                  {t("restore")}
                </Button>
              </li>
            ))}
          </ul>
        </details>
      )}

      {dialog?.kind === "add" && <AddWalletDialog open onOpenChange={close} existing={wallets} />}
      {dialog?.kind === "rename" && (
        <RenameWalletDialog open onOpenChange={close} wallet={dialog.wallet} />
      )}
      {dialog?.kind === "archive" && (
        <ArchiveWalletDialog
          open
          onOpenChange={close}
          wallet={dialog.wallet}
          others={active.filter((w) => w.id !== dialog.wallet.id)}
        />
      )}
    </div>
  );
}
