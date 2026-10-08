"use client";

import { MailIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSyncExternalStore } from "react";

import { Link } from "@/i18n/navigation";
import { readPendingEmail } from "@/lib/auth-errors";

import { SpamHint } from "./form-parts";
import { ResendVerification } from "./resend-verification";

const noSubscription = () => () => undefined;

export function CheckEmail() {
  const t = useTranslations("Auth.checkEmail");
  // Read after hydration: the server doesn't know the address.
  const email = useSyncExternalStore(noSubscription, readPendingEmail, () => null);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <MailIcon className="size-10 text-primary" aria-hidden />
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-balance" data-testid="check-email-body">
          {email
            ? // First-strong isolate: the address stays left to right inside Arabic text.
              t("body", { email: `⁨${email}⁩` })
            : t("bodyNoEmail")}
        </p>
        <p className="text-sm text-balance text-muted-foreground">{t("expiry")}</p>
      </div>
      <SpamHint />
      <ResendVerification email={email} justSent />
      <Link
        href="/sign-up"
        className="text-center text-sm text-primary underline-offset-4 hover:underline"
      >
        {t("wrongEmail")}
      </Link>
    </div>
  );
}
