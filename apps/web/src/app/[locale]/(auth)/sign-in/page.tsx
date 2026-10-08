import { getTranslations } from "next-intl/server";

import { AuthHeading } from "@/components/auth/auth-heading";
import { FormMessage } from "@/components/auth/form-parts";
import { GoogleButton, OrDivider } from "@/components/auth/google-button";
import { SignInForm } from "@/components/auth/sign-in-form";
import { Link } from "@/i18n/navigation";
import { googleEnabled } from "@/lib/auth";
import { redirectIfSignedIn } from "@/lib/session";

export default async function SignInPage({ searchParams }: PageProps<"/[locale]/sign-in">) {
  await redirectIfSignedIn();
  const t = await getTranslations("Auth");
  const { reset, error } = await searchParams;
  // Set by Better Auth when a Google sign-in fails (errorCallbackURL).
  const googleError =
    typeof error === "string"
      ? error === "account_not_linked"
        ? t("google.accountNotLinked")
        : t("google.failed")
      : null;

  return (
    <>
      <AuthHeading title={t("signIn.title")} />
      {googleError && <FormMessage tone="error">{googleError}</FormMessage>}
      {googleEnabled() && (
        <>
          <GoogleButton />
          <OrDivider />
        </>
      )}
      <SignInForm resetDone={reset === "done"} />
      <p className="text-center text-sm text-muted-foreground">
        {t("signIn.noAccount")}{" "}
        <Link
          href="/sign-up"
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          {t("signIn.signUp")}
        </Link>
      </p>
    </>
  );
}
