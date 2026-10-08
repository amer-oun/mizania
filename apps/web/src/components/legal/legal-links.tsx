import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";

/** "Privacy · Terms", at the bottom of public and sign-in screens. */
export function LegalLinks() {
  const t = useTranslations("Legal");
  return (
    <nav
      aria-label={t("label")}
      className="flex justify-center gap-3 text-xs text-muted-foreground"
    >
      <Link href="/privacy" className="underline-offset-4 hover:underline">
        {t("privacy")}
      </Link>
      <span aria-hidden>·</span>
      <Link href="/terms" className="underline-offset-4 hover:underline">
        {t("terms")}
      </Link>
    </nav>
  );
}
