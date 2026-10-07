import { useTranslations } from "next-intl";

import { LanguageSwitcher } from "@/components/language-switcher";

export default function HomePage() {
  const t = useTranslations("Home");

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col px-4 pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]">
      <header className="flex justify-end py-4">
        <LanguageSwitcher />
      </header>
      <main className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
        <h1 className="text-5xl font-bold tracking-tight text-primary">{t("title")}</h1>
        <p className="max-w-xs text-balance text-muted-foreground">{t("tagline")}</p>
      </main>
    </div>
  );
}
