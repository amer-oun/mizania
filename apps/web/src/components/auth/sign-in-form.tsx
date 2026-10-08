"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import { Link, useRouter } from "@/i18n/navigation";
import { authClient } from "@/lib/auth-client";
import { attempt, commonError } from "@/lib/auth-errors";

import {
  Field,
  FormMessage,
  OfflineNotice,
  PasswordField,
  SubmitButton,
  submitHandler,
} from "./form-parts";

export function SignInForm({ resetDone }: { resetDone: boolean }) {
  const t = useTranslations("Auth");
  const locale = useLocale();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = submitHandler(async (field) => {
    setPending(true);
    setError(null);
    const result = await attempt(() =>
      authClient.signIn.email({
        email: field("email"),
        password: field("password"),
        // Where the fresh verification link leads, if the email isn't verified yet.
        callbackURL: `/${locale}/verify-email`,
      }),
    );

    if (!result.error) {
      router.replace("/");
      router.refresh();
      return;
    }
    setPending(false);
    if (result.error.status === 401) setError(t("signIn.invalid"));
    else if (result.error.status === 403) setError(t("signIn.notVerified"));
    else setError(t(`common.${commonError(result.error)}`));
  });

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <OfflineNotice />
      {resetDone && !error && <FormMessage tone="success">{t("signIn.resetDone")}</FormMessage>}
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
        autoComplete="current-password"
        minLength={1}
      />
      <Link
        href="/forgot-password"
        className="text-sm text-primary underline-offset-4 hover:underline"
      >
        {t("signIn.forgot")}
      </Link>
      {error && <FormMessage tone="error">{error}</FormMessage>}
      <SubmitButton pending={pending}>{t("signIn.submit")}</SubmitButton>
    </form>
  );
}
