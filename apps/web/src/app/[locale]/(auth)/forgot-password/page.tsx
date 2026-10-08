import { getTranslations } from "next-intl/server";

import { AuthHeading } from "@/components/auth/auth-heading";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import { Link } from "@/i18n/navigation";
import { redirectIfSignedIn } from "@/lib/session";

export default async function ForgotPasswordPage() {
  await redirectIfSignedIn();
  const t = await getTranslations("Auth.forgotPassword");

  return (
    <>
      <AuthHeading title={t("title")} subtitle={t("body")} />
      <ForgotPasswordForm />
      <Link
        href="/sign-in"
        className="text-center text-sm text-primary underline-offset-4 hover:underline"
      >
        {t("back")}
      </Link>
    </>
  );
}
