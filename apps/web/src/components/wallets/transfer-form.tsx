"use client";

import { parseTND, previewTransfer } from "@mizania/core";
import { TRANSFER_NOTE_MAX_LENGTH } from "@mizania/shared";
import { ArrowRightIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";

import { transferAction } from "@/app/actions/transfers";
import { MoneyInput } from "@/components/onboarding/fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useOnline } from "@/hooks/use-online";
import { useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

import { Amount, useWalletAction, useWalletName, WalletTypeIcon, type WalletView } from "./shared";

function WalletChoice({
  legend,
  name,
  wallets,
  value,
  onChange,
}: {
  legend: string;
  name: string;
  wallets: readonly WalletView[];
  value: string | null;
  onChange: (id: string) => void;
}) {
  const walletName = useWalletName();
  return (
    <fieldset className="flex flex-col gap-2" data-testid={`transfer-${name}`}>
      <legend className="mb-2 text-sm font-medium">{legend}</legend>
      <div className="grid grid-cols-2 gap-2">
        {wallets.map((w) => (
          <label
            key={w.id}
            className={cn(
              "flex min-h-14 cursor-pointer flex-col justify-center gap-0.5 rounded-md border px-3 py-2 text-sm has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50",
              w.id === value && "border-primary bg-primary/10",
            )}
          >
            <input
              type="radio"
              name={name}
              value={w.id}
              className="sr-only"
              checked={w.id === value}
              onChange={() => {
                onChange(w.id);
              }}
            />
            <span className="flex items-center gap-2 font-medium">
              <WalletTypeIcon type={w.type} className="size-4 text-muted-foreground" />
              <span className="truncate">{walletName(w)}</span>
            </span>
            <Amount millimes={w.balanceMillimes} className="text-xs text-muted-foreground" />
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/**
 * From → to → amount → note, with both balances after the transfer shown
 * before confirming. The source may go below 0: balances are typed by hand.
 */
export function TransferForm({
  wallets,
  initialFrom,
  initialTo,
}: {
  /** Active wallets only. */
  wallets: readonly WalletView[];
  initialFrom: string | null;
  initialTo: string | null;
}) {
  const t = useTranslations("Wallets");
  const walletName = useWalletName();
  const router = useRouter();
  const online = useOnline();
  const { pending, error, run } = useWalletAction();
  const previewId = useId();
  const noteId = useId();
  // One ID per transfer: a retry after a lost response doesn't save it twice.
  const [id] = useState(() => crypto.randomUUID());
  const [fromId, setFromId] = useState(initialFrom);
  const [toId, setToId] = useState(initialTo === initialFrom ? null : initialTo);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");

  const from = wallets.find((w) => w.id === fromId);
  const to = wallets.find((w) => w.id === toId && w.id !== fromId);
  const amountMillimes = parseTND(amount);
  // Everything needed to confirm, with both balances after the transfer.
  const ready =
    from && to && amountMillimes !== null && amountMillimes > 0
      ? {
          from,
          to,
          amountMillimes,
          after: previewTransfer(from.balanceMillimes, to.balanceMillimes, amountMillimes),
        }
      : null;

  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        if (!ready) return;
        run(
          () =>
            transferAction({
              id,
              fromWalletId: ready.from.id,
              toWalletId: ready.to.id,
              amountMillimes: ready.amountMillimes,
              note,
            }),
          () => {
            router.push("/wallets");
          },
        );
      }}
    >
      <WalletChoice
        legend={t("from")}
        name="from"
        wallets={wallets}
        value={fromId}
        onChange={(next) => {
          setFromId(next);
          if (next === toId) setToId(null);
        }}
      />
      <WalletChoice
        legend={t("to")}
        name="to"
        wallets={wallets.filter((w) => w.id !== fromId)}
        value={to?.id ?? null}
        onChange={setToId}
      />
      <MoneyInput label={t("amount")} value={amount} onChange={setAmount} />
      <div className="flex flex-col gap-2">
        <Label htmlFor={noteId}>{t("note")}</Label>
        <Input
          id={noteId}
          value={note}
          maxLength={TRANSFER_NOTE_MAX_LENGTH}
          placeholder={t("notePlaceholder")}
          autoComplete="off"
          onChange={(e) => {
            setNote(e.target.value);
          }}
        />
      </div>

      {ready && (
        <section
          aria-labelledby={previewId}
          className="rounded-xl border p-4"
          data-testid="transfer-preview"
        >
          <h2 id={previewId} className="mb-2 text-sm font-medium">
            {t("after")}
          </h2>
          <dl className="flex flex-col gap-1 text-sm">
            {[
              { wallet: ready.from, before: ready.from.balanceMillimes, now: ready.after.from },
              { wallet: ready.to, before: ready.to.balanceMillimes, now: ready.after.to },
            ].map((row) => (
              <div key={row.wallet.id} className="flex items-center justify-between gap-2">
                <dt>{walletName(row.wallet)}</dt>
                <dd dir="ltr" className="flex items-center gap-1">
                  <Amount millimes={row.before} className="text-muted-foreground" />
                  <ArrowRightIcon className="size-3 text-muted-foreground" aria-hidden />
                  <Amount millimes={row.now} className="font-semibold" />
                </dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {!online && <p className="text-sm text-muted-foreground">{t("offline")}</p>}
      <Button type="submit" size="lg" disabled={!ready || pending || !online}>
        {pending ? t("saving") : t("confirm")}
      </Button>
    </form>
  );
}
