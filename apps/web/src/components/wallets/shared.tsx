"use client";

import { formatTND, type WalletKind } from "@mizania/core";
import type { WalletWithBalance } from "@mizania/db/wallets";
import {
  BanknoteIcon,
  CreditCardIcon,
  type LucideIcon,
  SmartphoneIcon,
  WalletIcon,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { type ComponentProps, useState, useTransition } from "react";

import { useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import type { WalletActionResult } from "@/lib/wallet-action";

export type WalletView = WalletWithBalance;

/** A wallet's name: what the student typed for "other", else its type. */
export function useWalletName() {
  const t = useTranslations("WalletTypes");
  return (wallet: Pick<WalletView, "type" | "name">) => wallet.name ?? t(wallet.type);
}

const icons: Record<WalletKind, LucideIcon> = {
  cash: BanknoteIcon,
  d17: SmartphoneIcon,
  flouci: SmartphoneIcon,
  card: CreditCardIcon,
  other: WalletIcon,
};

export function WalletTypeIcon({ type, className }: { type: WalletKind; className?: string }) {
  const Icon = icons[type];
  return <Icon className={cn("size-5", className)} aria-hidden />;
}

// Unicode "first strong isolate" and "pop directional isolate".
const ISOLATE = String.fromCodePoint(0x2068);
const END_ISOLATE = String.fromCodePoint(0x2069);

/**
 * Formats millimes for use inside a sentence, isolated so the digits stay
 * left to right in Arabic text.
 */
export function useFormatAmount() {
  const locale = useLocale();
  return (millimes: number) => `${ISOLATE}${formatTND(millimes, locale)}${END_ISOLATE}`;
}

/** An amount in millimes, left to right in every language; red below 0. */
export function Amount({
  millimes,
  className,
  ...props
}: { millimes: number } & ComponentProps<"span">) {
  const locale = useLocale();
  return (
    <span
      dir="ltr"
      className={cn("tabular-nums", millimes < 0 && "text-destructive", className)}
      {...props}
    >
      {formatTND(millimes, locale)}
    </span>
  );
}

/**
 * Runs a wallet server action, then reloads the page's data. `error` is the
 * translated message of the last failure.
 */
export function useWalletAction() {
  const t = useTranslations("Wallets.errors");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(action: () => Promise<WalletActionResult>, onDone?: () => void) {
    setError(null);
    startTransition(async () => {
      let result: WalletActionResult;
      try {
        result = await action();
      } catch {
        result = { ok: false, error: "server" };
      }
      if (!result.ok) {
        setError(t(result.error));
        return;
      }
      onDone?.();
      router.refresh();
    });
  }

  return { pending, error, setError, run };
}
