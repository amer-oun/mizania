import { getTranslations } from "next-intl/server";

import { AuthHeading } from "@/components/auth/auth-heading";
import { SignUpForm } from "@/components/auth/sign-up-form";
import { Link } from "@/i18n/navigation";
import { redirectIfSignedIn } from "@/lib/session";

export default async function SignUpPage() {
  await redirectIfSignedIn();
  const t = await getTranslations("Auth.signUp");

  return (
    <>
      <AuthHeading title={t("title")} subtitle={t("subtitle")} />
      <SignUpForm />
      <p className="text-center text-sm text-muted-foreground">
        {t("haveAccount")}{" "}
        <Link
          href="/sign-in"
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          {t("signIn")}
        </Link>
      </p>
    </>
  );
}
