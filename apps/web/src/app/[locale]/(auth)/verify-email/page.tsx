import { CircleCheckIcon, CircleXIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { ResendVerification } from "@/components/auth/resend-verification";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { getSession } from "@/lib/session";

// Where the verification link lands. Better Auth has already checked the
// token: on success it signed the user in; otherwise it added ?error=.
export default async function VerifyEmailPage({
  searchParams,
}: PageProps<"/[locale]/verify-email">) {
  const t = await getTranslations("Auth.verifyEmail");
  const { error } = await searchParams;

  if (typeof error === "string") {
    const expired = error.toUpperCase() === "TOKEN_EXPIRED";
    return (
      <>
        <div className="flex flex-col items-center gap-3 text-center">
          <CircleXIcon className="size-10 text-destructive" aria-hidden />
          <h1 className="text-2xl font-bold">{expired ? t("expiredTitle") : t("invalidTitle")}</h1>
          <p className="text-balance text-muted-foreground">{t("errorBody")}</p>
        </div>
        <ResendVerification email={null} />
      </>
    );
  }

  const session = await getSession();
  return (
    <div className="flex flex-col items-center gap-6 text-center">
      <div className="flex flex-col items-center gap-3">
        <CircleCheckIcon className="size-10 text-primary" aria-hidden />
        <h1 className="text-2xl font-bold">{t("confirmedTitle")}</h1>
        <p className="text-muted-foreground">{t("confirmedBody")}</p>
      </div>
      <Button asChild size="lg" className="w-full">
        <Link href={session ? "/" : "/sign-in"}>{session ? t("continue") : t("signIn")}</Link>
      </Button>
    </div>
  );
}
