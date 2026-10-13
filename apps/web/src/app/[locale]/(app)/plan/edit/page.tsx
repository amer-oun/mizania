import { todayInTunis } from "@mizania/core";
import { getPlanEditor } from "@mizania/db/plan";
import { ArrowLeftIcon } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { PlanEditor } from "@/components/plan/plan-editor";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { getDb } from "@/lib/db";
import { requireSession } from "@/lib/session";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("PlanEdit");
  return { title: `${t("title")} · Mizania` };
}

export default async function PlanEditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { user } = await requireSession();
  const t = await getTranslations("PlanEdit");
  const data = await getPlanEditor(getDb(), user.id, todayInTunis());
  // ?from=today: opened from "Adjust my plan" on the over-budget screen.
  const backTo = (await searchParams).from === "today" ? "/" : "/plan";

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 pt-[env(safe-area-inset-top)]">
      <header className="flex flex-col gap-1 py-4">
        <Button asChild variant="ghost" size="sm" className="-ms-3 self-start">
          <Link href={backTo}>
            <ArrowLeftIcon className="rtl:rotate-180" />
            {t("back")}
          </Link>
        </Button>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </header>
      <main className="flex flex-1 flex-col pb-6">
        {data ? (
          <PlanEditor data={data} backTo={backTo} />
        ) : (
          <p className="text-muted-foreground">{t("noCycle")}</p>
        )}
      </main>
    </div>
  );
}
