"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import { authClient } from "@/lib/auth-client";
import { attempt, commonError } from "@/lib/auth-errors";

import {
  Field,
  FormMessage,
  OfflineNotice,
  SpamHint,
  SubmitButton,
  submitHandler,
} from "./form-parts";

export function ForgotPasswordForm() {
  const t = useTranslations("Auth");
  const locale = useLocale();
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = submitHandler(async (field) => {
    const email = field("email");
    setPending(true);
    setError(null);
    const result = await attempt(() =>
      authClient.requestPasswordReset({ email, redirectTo: `/${locale}/reset-password` }),
    );
    setPending(false);

    if (result.error) setError(t(`common.${commonError(result.error)}`));
    // Same message whether or not the address has an account.
    else setSent(true);
  });

  if (sent) {
    return (
      <div className="flex flex-col gap-3">
        <FormMessage tone="success">{t("forgotPassword.sent")}</FormMessage>
        <SpamHint />
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <OfflineNotice />
      <Field
        label={t("common.email")}
        name="email"
        type="email"
        inputMode="email"
        autoComplete="email"
        dir="ltr"
        required
      />
      {error && <FormMessage tone="error">{error}</FormMessage>}
      <SubmitButton pending={pending}>{t("forgotPassword.submit")}</SubmitButton>
    </form>
  );
}
