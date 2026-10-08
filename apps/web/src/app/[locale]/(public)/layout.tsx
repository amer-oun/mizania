import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

import { LanguageSwitcher } from "@/components/language-switcher";
import { LegalLinks } from "@/components/legal/legal-links";
import { Link } from "@/i18n/navigation";

// Pages anyone can open without an account: privacy policy and terms.
export default async function PublicLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations("Home");

  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col px-4 pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]">
      <header className="flex items-center justify-between py-4">
        <Link href="/" className="text-xl font-bold text-primary">
          {t("title")}
        </Link>
        <LanguageSwitcher />
      </header>
      <main className="flex-1 pb-8">{children}</main>
      <footer className="py-6">
        <LegalLinks />
      </footer>
    </div>
  );
}
