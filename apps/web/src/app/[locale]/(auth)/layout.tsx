import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

import { LanguageSwitcher } from "@/components/language-switcher";

// Sign-up, sign-in, email verification and password reset screens.
export default async function AuthLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations("Home");

  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col px-4 pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]">
      <header className="flex items-center justify-between py-4">
        <span className="text-xl font-bold text-primary">{t("title")}</span>
        <LanguageSwitcher />
      </header>
      <main className="flex flex-1 flex-col justify-center gap-6 pb-12">{children}</main>
    </div>
  );
}
