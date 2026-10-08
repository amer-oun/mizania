import { getTranslations } from "next-intl/server";

import { AuthHeading } from "@/components/auth/auth-heading";
import { GoogleButton, OrDivider } from "@/components/auth/google-button";
import { SignUpForm } from "@/components/auth/sign-up-form";
import { Link } from "@/i18n/navigation";
import { googleEnabled } from "@/lib/auth";
import { redirectIfSignedIn } from "@/lib/session";

export default async function SignUpPage() {
  await redirectIfSignedIn();
  const t = await getTranslations("Auth.signUp");

  return (
    <>
      <AuthHeading title={t("title")} subtitle={t("subtitle")} />
      {googleEnabled() && (
        <>
          <GoogleButton />
          <OrDivider />
        </>
      )}
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
