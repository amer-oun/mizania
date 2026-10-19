import { todayInTunis } from "@mizania/core";
import { getMonthByCategory } from "@mizania/db/insights";
import { ArrowLeftIcon } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { MonthScreen } from "@/components/month/month-screen";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { getDb } from "@/lib/db";
import { requireSession } from "@/lib/session";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Month");
  return { title: `${t("title")} · Mizania` };
}

/** This month by category, compared with last month at the same point (decision 12). */
export default async function MonthPage() {
  const { user } = await requireSession();
  const t = await getTranslations("Month");
  const month = await getMonthByCategory(getDb(), user.id, todayInTunis());

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 pt-[env(safe-area-inset-top)]">
      <header className="flex flex-col gap-1 py-4">
        <Button asChild variant="ghost" size="sm" className="-ms-3 self-start">
          <Link href="/">
            <ArrowLeftIcon className="rtl:rotate-180" />
            {t("back")}
          </Link>
        </Button>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
      </header>
      <main className="flex flex-1 flex-col pb-6">
        {month ? (
          <MonthScreen data={month} />
        ) : (
          <p className="text-muted-foreground" data-testid="no-cycle">
            {t("noCycle")}
          </p>
        )}
      </main>
    </div>
  );
}
