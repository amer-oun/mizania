"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { attempt, commonError, rememberPendingEmail } from "@/lib/auth-errors";

import { Field, FormMessage, OfflineNotice, SubmitButton, submitHandler } from "./form-parts";

const COOLDOWN_SECONDS = 60;

/**
 * Sends a new verification link. With a known address it's one button
 * (with a wait between sends); otherwise it asks for the address first.
 */
export function ResendVerification({
  email,
  justSent = false,
}: {
  email: string | null;
  justSent?: boolean;
}) {
  const t = useTranslations("Auth");
  const locale = useLocale();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [wait, setWait] = useState(justSent ? COOLDOWN_SECONDS : 0);

  useEffect(() => {
    if (wait <= 0) return;
    const timer = setTimeout(() => {
      setWait((s) => s - 1);
    }, 1000);
    return () => {
      clearTimeout(timer);
    };
  }, [wait]);

  const onSubmit = submitHandler(async (field) => {
    const address = email ?? field("email");
    setPending(true);
    setMessage(null);
    const result = await attempt(() =>
      authClient.sendVerificationEmail({
        email: address,
        callbackURL: `/${locale}/verify-email`,
      }),
    );
    setPending(false);
    if (result.error) {
      setMessage({ tone: "error", text: t(`common.${commonError(result.error)}`) });
      return;
    }
    rememberPendingEmail(address);
    setMessage({ tone: "success", text: t("checkEmail.resent") });
    setWait(COOLDOWN_SECONDS);
  });

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <OfflineNotice />
      {!email && (
        <Field
          label={t("common.email")}
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          dir="ltr"
          required
        />
      )}
      {message && <FormMessage tone={message.tone}>{message.text}</FormMessage>}
      {wait > 0 ? (
        <Button type="button" size="lg" variant="outline" className="w-full" disabled>
          {t("checkEmail.resendIn", { seconds: wait })}
        </Button>
      ) : (
        <SubmitButton pending={pending}>{t("checkEmail.resend")}</SubmitButton>
      )}
    </form>
  );
}
