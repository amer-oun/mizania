import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

/** A reset link that is expired, used or broken. */
export function LinkExpired() {
  const t = useTranslations("Auth.resetPassword");
  return (
    <div className="flex flex-col gap-4 text-center">
      <h2 className="text-lg font-semibold">{t("expiredTitle")}</h2>
      <p className="text-balance text-muted-foreground">{t("expiredBody")}</p>
      <Button asChild size="lg" className="w-full">
        <Link href="/forgot-password">{t("requestNew")}</Link>
      </Button>
    </div>
  );
}
