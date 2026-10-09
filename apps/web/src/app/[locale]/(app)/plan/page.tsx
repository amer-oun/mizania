import { todayInTunis } from "@mizania/core";
import { getPlan } from "@mizania/db/plan";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { PlanScreen } from "@/components/plan/plan-screen";
import { getDb } from "@/lib/db";
import { requireSession } from "@/lib/session";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Plan");
  return { title: `${t("title")} · Mizania` };
}

export default async function PlanPage() {
  const { user } = await requireSession();
  const t = await getTranslations("Plan");
  const plan = await getPlan(getDb(), user.id, todayInTunis());

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 pt-[env(safe-area-inset-top)]">
      <header className="py-4">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
      </header>
      <main className="flex flex-col pb-6">
        {plan ? (
          <PlanScreen plan={plan} />
        ) : (
          <p className="text-muted-foreground">{t("noCycle")}</p>
        )}
      </main>
    </div>
  );
}
