import { getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

import { signOut } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { redirect } from "@/i18n/navigation";
import { requireSession } from "@/lib/session";

// The onboarding wizard: signed-in users who haven't finished it yet.
export default async function OnboardingLayout({ children }: { children: ReactNode }) {
  const { user } = await requireSession();
  const locale = await getLocale();
  if (user.onboardedAt) redirect({ href: "/", locale });
  const t = await getTranslations("Home");

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col px-4 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <header className="flex items-center justify-between py-4">
        <span className="text-xl font-bold text-primary">{t("title")}</span>
        {/* Wrong account on a shared phone: a way out before finishing. */}
        <form action={signOut.bind(null, locale)}>
          <Button type="submit" variant="ghost" size="sm">
            {t("signOut")}
          </Button>
        </form>
      </header>
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  );
}
