"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { useRouter } from "@/i18n/navigation";
import { authClient } from "@/lib/auth-client";
import { attempt, commonError } from "@/lib/auth-errors";

import {
  FormMessage,
  OfflineNotice,
  PasswordField,
  SubmitButton,
  submitHandler,
} from "./form-parts";
import { LinkExpired } from "./link-expired";

export function ResetPasswordForm({ token }: { token: string }) {
  const t = useTranslations("Auth");
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [expired, setExpired] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = submitHandler(async (field) => {
    const newPassword = field("password");
    if (newPassword !== field("confirm")) {
      setError(t("resetPassword.mismatch"));
      return;
    }

    setPending(true);
    setError(null);
    const result = await attempt(() => authClient.resetPassword({ newPassword, token }));

    if (!result.error) {
      router.replace({ pathname: "/sign-in", query: { reset: "done" } });
      return;
    }
    setPending(false);
    if (result.error.code === "INVALID_TOKEN") setExpired(true);
    else setError(t(`common.${commonError(result.error)}`));
  });

  if (expired) return <LinkExpired />;

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <OfflineNotice />
      <PasswordField
        label={t("resetPassword.newPassword")}
        name="password"
        autoComplete="new-password"
        hint={t("common.passwordHint")}
      />
      <PasswordField
        label={t("resetPassword.confirmPassword")}
        name="confirm"
        autoComplete="new-password"
      />
      {error && <FormMessage tone="error">{error}</FormMessage>}
      <SubmitButton pending={pending}>{t("resetPassword.submit")}</SubmitButton>
    </form>
  );
}
