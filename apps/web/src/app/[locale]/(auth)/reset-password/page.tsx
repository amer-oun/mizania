import { getTranslations } from "next-intl/server";

import { AuthHeading } from "@/components/auth/auth-heading";
import { LinkExpired } from "@/components/auth/link-expired";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";

// Where the reset link lands: Better Auth adds ?token=… or ?error=INVALID_TOKEN.
export default async function ResetPasswordPage({
  searchParams,
}: PageProps<"/[locale]/reset-password">) {
  const t = await getTranslations("Auth.resetPassword");
  const { token, error } = await searchParams;

  if (typeof token !== "string" || error !== undefined) return <LinkExpired />;

  return (
    <>
      <AuthHeading title={t("title")} />
      <ResetPasswordForm token={token} />
    </>
  );
}
