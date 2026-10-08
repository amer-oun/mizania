import { getTranslations } from "next-intl/server";

import { signOut } from "@/app/actions/auth";
import { LanguageSwitcher } from "@/components/language-switcher";
import { Button } from "@/components/ui/button";
import { requireSession } from "@/lib/session";

// Placeholder until onboarding and the daily amount (PR 3).
export default async function HomePage() {
  const { user } = await requireSession();
  const t = await getTranslations("Home");

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col px-4 pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]">
      <header className="flex items-center justify-between gap-2 py-4">
        <form action={signOut}>
          <Button type="submit" variant="ghost" size="sm">
            {t("signOut")}
          </Button>
        </form>
        <LanguageSwitcher />
      </header>
      <main className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
        <h1 className="text-5xl font-bold tracking-tight text-primary">{t("title")}</h1>
        <p className="max-w-xs text-balance text-muted-foreground">{t("tagline")}</p>
        <p className="text-sm text-muted-foreground" data-testid="signed-in-as">
          {t("signedInAs", { name: user.name })}
        </p>
      </main>
    </div>
  );
}
