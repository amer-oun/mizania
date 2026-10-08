"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import { useRouter } from "@/i18n/navigation";
import { authClient } from "@/lib/auth-client";
import { attempt, commonError, rememberPendingEmail } from "@/lib/auth-errors";

import {
  Field,
  FormMessage,
  OfflineNotice,
  PasswordField,
  SubmitButton,
  submitHandler,
} from "./form-parts";

export function SignUpForm() {
  const t = useTranslations("Auth");
  const locale = useLocale();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = submitHandler(async (field) => {
    const email = field("email");

    setPending(true);
    setError(null);
    const result = await attempt(() =>
      authClient.signUp.email({
        name: field("name"),
        email,
        password: field("password"),
        // Emails go out in the language of the page the user signed up on.
        locale,
        callbackURL: `/${locale}/verify-email`,
      }),
    );
    setPending(false);

    if (result.error) {
      setError(t(`common.${commonError(result.error)}`));
      return;
    }
    // Same screen whether or not the email already had an account.
    rememberPendingEmail(email);
    router.push("/check-email");
  });

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <OfflineNotice />
      <Field
        label={t("common.firstName")}
        name="name"
        autoComplete="given-name"
        required
        maxLength={50}
      />
      <Field
        label={t("common.email")}
        name="email"
        type="email"
        inputMode="email"
        autoComplete="email"
        dir="ltr"
        required
      />
      <PasswordField
        label={t("common.password")}
        name="password"
        autoComplete="new-password"
        hint={t("common.passwordHint")}
      />
      {error && <FormMessage tone="error">{error}</FormMessage>}
      <SubmitButton pending={pending}>{t("signUp.submit")}</SubmitButton>
    </form>
  );
}
