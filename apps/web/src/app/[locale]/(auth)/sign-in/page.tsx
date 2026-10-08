import { getTranslations } from "next-intl/server";

import { AuthHeading } from "@/components/auth/auth-heading";
import { SignInForm } from "@/components/auth/sign-in-form";
import { Link } from "@/i18n/navigation";
import { redirectIfSignedIn } from "@/lib/session";

export default async function SignInPage({ searchParams }: PageProps<"/[locale]/sign-in">) {
  await redirectIfSignedIn();
  const t = await getTranslations("Auth.signIn");
  const { reset } = await searchParams;

  return (
    <>
      <AuthHeading title={t("title")} />
      <SignInForm resetDone={reset === "done"} />
      <p className="text-center text-sm text-muted-foreground">
        {t("noAccount")}{" "}
        <Link
          href="/sign-up"
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          {t("signUp")}
        </Link>
      </p>
    </>
  );
}
