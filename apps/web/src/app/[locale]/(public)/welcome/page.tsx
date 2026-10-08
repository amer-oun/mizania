import { CalendarClockIcon, LanguagesIcon, WalletIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { redirectIfSignedIn } from "@/lib/session";

// The public home page: what Mizania is, for visitors and for Google's
// OAuth branding review. Signed-out visitors to / land here.
export default async function WelcomePage() {
  await redirectIfSignedIn();
  const t = await getTranslations("Welcome");
  const home = await getTranslations("Home");

  const points = [
    { key: "today", icon: CalendarClockIcon },
    { key: "wallets", icon: WalletIcon },
    { key: "languages", icon: LanguagesIcon },
  ] as const;

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-8 py-6">
      <div className="flex flex-col gap-3 text-center">
        <h1 className="text-5xl font-bold tracking-tight text-primary">{home("title")}</h1>
        <p className="text-balance text-lg text-muted-foreground">{home("tagline")}</p>
      </div>
      <ul className="flex flex-col gap-4">
        {points.map(({ key, icon: Icon }) => (
          <li key={key} className="flex gap-3">
            <Icon className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
            <span>{t(`points.${key}`)}</span>
          </li>
        ))}
      </ul>
      <div className="flex flex-col gap-3">
        <Button asChild size="lg" className="w-full">
          <Link href="/sign-up">{t("signUp")}</Link>
        </Button>
        <Button asChild size="lg" variant="outline" className="w-full">
          <Link href="/sign-in">{t("signIn")}</Link>
        </Button>
      </div>
    </div>
  );
}
