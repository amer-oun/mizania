"use client";

import { parseTND, WALLET_NAME_MAX_LENGTH, type WalletKind, walletKinds } from "@mizania/core";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";

import { addWalletAction, archiveWalletAction, renameWalletAction } from "@/app/actions/wallets";
import { MoneyInput } from "@/components/onboarding/fields";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useOnline } from "@/hooks/use-online";
import { cn } from "@/lib/utils";

import {
  useFormatAmount,
  useWalletAction,
  useWalletName,
  WalletTypeIcon,
  type WalletView,
} from "./shared";

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-sm text-destructive">
      {message}
    </p>
  );
}

function OfflineNote({ online }: { online: boolean }) {
  const t = useTranslations("Wallets");
  if (online) return null;
  return <p className="text-sm text-muted-foreground">{t("offline")}</p>;
}

function SubmitRow({
  disabled,
  pending,
  label,
  onCancel,
}: {
  disabled: boolean;
  pending: boolean;
  label: string;
  onCancel: () => void;
}) {
  const t = useTranslations("Wallets");
  return (
    <div className="flex gap-2">
      <Button type="button" variant="outline" size="lg" className="flex-1" onClick={onCancel}>
        {t("cancel")}
      </Button>
      <Button type="submit" size="lg" className="flex-1" disabled={disabled || pending}>
        {pending ? t("saving") : label}
      </Button>
    </div>
  );
}

function NameField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const t = useTranslations("Wallets");
  const id = useId();
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{t("nameLabel")}</Label>
      <Input
        id={id}
        value={value}
        maxLength={WALLET_NAME_MAX_LENGTH}
        placeholder={t("namePlaceholder")}
        autoComplete="off"
        onChange={(e) => {
          onChange(e.target.value);
        }}
      />
    </div>
  );
}

/** Cash, D17, Flouci and card exist once; "other" can repeat. */
export function AddWalletDialog({
  existing,
  ...dialog
}: DialogProps & { existing: readonly WalletView[] }) {
  const t = useTranslations("Wallets");
  const typeName = useTranslations("WalletTypes");
  const online = useOnline();
  const { pending, error, setError, run } = useWalletAction();
  const available = walletKinds.filter(
    (kind) => kind === "other" || !existing.some((w) => w.type === kind),
  );
  const [kind, setKind] = useState<WalletKind>(available[0] ?? "other");
  const [name, setName] = useState("");
  const [balance, setBalance] = useState("");

  const balanceMillimes = balance.trim() === "" ? 0 : parseTND(balance);
  const valid = balanceMillimes !== null && (kind !== "other" || name.trim() !== "");

  function reset(open: boolean) {
    if (!open) {
      setName("");
      setBalance("");
      setError(null);
    }
    dialog.onOpenChange(open);
  }

  return (
    <Dialog open={dialog.open} onOpenChange={reset}>
      <DialogContent closeLabel={t("close")}>
        <DialogTitle>{t("addTitle")}</DialogTitle>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!valid) return;
            run(
              () =>
                addWalletAction({
                  kind,
                  name: kind === "other" ? name : undefined,
                  balanceMillimes,
                }),
              () => {
                reset(false);
              },
            );
          }}
        >
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-medium">{t("typeLabel")}</legend>
            <div className="flex flex-wrap gap-2">
              {available.map((k) => (
                <label
                  key={k}
                  className={cn(
                    "flex h-11 cursor-pointer items-center gap-2 rounded-md border px-3 text-sm",
                    k === kind && "border-primary bg-primary/10 text-primary",
                  )}
                >
                  <input
                    type="radio"
                    name="kind"
                    value={k}
                    className="sr-only"
                    checked={k === kind}
                    onChange={() => {
                      setKind(k);
                    }}
                  />
                  <WalletTypeIcon type={k} />
                  {typeName(k)}
                </label>
              ))}
            </div>
            {available.length === 1 && (
              <p className="text-xs text-muted-foreground">{t("allTypesTaken")}</p>
            )}
          </fieldset>
          {kind === "other" && <NameField value={name} onChange={setName} />}
          <div className="flex flex-col gap-1">
            <MoneyInput label={t("balanceLabel")} value={balance} onChange={setBalance} />
            <p className="text-xs text-muted-foreground">{t("balanceHint")}</p>
          </div>
          <FormError message={error} />
          <OfflineNote online={online} />
          <SubmitRow
            disabled={!valid || !online}
            pending={pending}
            label={t("save")}
            onCancel={() => {
              reset(false);
            }}
          />
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function RenameWalletDialog({ wallet, ...dialog }: DialogProps & { wallet: WalletView }) {
  const t = useTranslations("Wallets");
  const walletName = useWalletName();
  const online = useOnline();
  const { pending, error, run } = useWalletAction();
  const [name, setName] = useState(wallet.name ?? "");
  const valid = name.trim() !== "" && name.trim() !== wallet.name;

  return (
    <Dialog {...dialog}>
      <DialogContent closeLabel={t("close")}>
        <DialogTitle>{t("renameTitle", { name: walletName(wallet) })}</DialogTitle>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!valid) return;
            run(
              () => renameWalletAction({ walletId: wallet.id, name }),
              () => {
                dialog.onOpenChange(false);
              },
            );
          }}
        >
          <NameField value={name} onChange={setName} />
          <FormError message={error} />
          <OfflineNote online={online} />
          <SubmitRow
            disabled={!valid || !online}
            pending={pending}
            label={t("save")}
            onCancel={() => {
              dialog.onOpenChange(false);
            }}
          />
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * An archived wallet is always at 0: a balance is first moved to another
 * active wallet, or set to 0 ("I don't have this money any more").
 */
export function ArchiveWalletDialog({
  wallet,
  others,
  ...dialog
}: DialogProps & { wallet: WalletView; others: readonly WalletView[] }) {
  const t = useTranslations("Wallets");
  const walletName = useWalletName();
  const online = useOnline();
  const { pending, error, run } = useWalletAction();
  const preferred = others.find((w) => w.type === "cash") ?? others[0];
  const [choice, setChoice] = useState<"move" | "zero">("move");
  const [toWalletId, setToWalletId] = useState(preferred?.id ?? "");
  const formatAmount = useFormatAmount();
  const selectId = useId();
  const name = walletName(wallet);

  return (
    <Dialog {...dialog}>
      <DialogContent closeLabel={t("close")}>
        <DialogTitle>{t("archiveTitle", { name })}</DialogTitle>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            run(
              () =>
                archiveWalletAction({
                  walletId: wallet.id,
                  choice: choice === "move" ? { kind: "move", toWalletId } : { kind: "zero" },
                }),
              () => {
                dialog.onOpenChange(false);
              },
            );
          }}
        >
          {wallet.balanceMillimes === 0 ? (
            <DialogDescription>{t("archiveEmpty")}</DialogDescription>
          ) : (
            <>
              <DialogDescription>
                {t("archiveBalance", { name, amount: formatAmount(wallet.balanceMillimes) })}
              </DialogDescription>
              <div className="flex flex-col gap-3">
                <label className="flex min-h-11 items-center gap-3">
                  <input
                    type="radio"
                    name="choice"
                    className="size-5 accent-primary"
                    checked={choice === "move"}
                    onChange={() => {
                      setChoice("move");
                    }}
                  />
                  <span>{t("archiveMove")}</span>
                </label>
                <select
                  id={selectId}
                  aria-label={t("archiveMove")}
                  className="h-11 rounded-md border bg-background px-3 disabled:opacity-50"
                  disabled={choice !== "move"}
                  value={toWalletId}
                  onChange={(e) => {
                    setToWalletId(e.target.value);
                  }}
                >
                  {others.map((w) => (
                    <option key={w.id} value={w.id}>
                      {walletName(w)}
                    </option>
                  ))}
                </select>
                <label className="flex min-h-11 items-center gap-3">
                  <input
                    type="radio"
                    name="choice"
                    className="size-5 accent-primary"
                    checked={choice === "zero"}
                    onChange={() => {
                      setChoice("zero");
                    }}
                  />
                  <span>{t("archiveZero")}</span>
                </label>
              </div>
            </>
          )}
          <FormError message={error} />
          <OfflineNote online={online} />
          <SubmitRow
            disabled={!online || (choice === "move" && toWalletId === "")}
            pending={pending}
            label={t("archive")}
            onCancel={() => {
              dialog.onOpenChange(false);
            }}
          />
        </form>
      </DialogContent>
    </Dialog>
  );
}
