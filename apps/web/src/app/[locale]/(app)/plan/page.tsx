import { todayInTunis } from "@mizania/core";
import { getQuickLogOptions } from "@mizania/db/expenses";
import { getPlan } from "@mizania/db/plan";
import { PencilIcon } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { PlanWithActions } from "@/components/plan/plan-actions";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { getDb } from "@/lib/db";
import { requireSession } from "@/lib/session";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Plan");
  return { title: `${t("title")} · Mizania` };
}

export default async function PlanPage() {
  const { user } = await requireSession();
  const t = await getTranslations("Plan");
  const db = getDb();
  const [plan, { wallets, defaultWalletId }] = await Promise.all([
    getPlan(db, user.id, todayInTunis()),
    getQuickLogOptions(db, user.id),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 pt-[env(safe-area-inset-top)]">
      <header className="flex items-center justify-between gap-2 py-4">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        {plan && (
          <Button asChild variant="outline" size="sm">
            <Link href="/plan/edit">
              <PencilIcon aria-hidden />
              {t("change")}
            </Link>
          </Button>
        )}
      </header>
      <main className="flex flex-col pb-6">
        {plan ? (
          <PlanWithActions plan={plan} wallets={wallets} defaultWalletId={defaultWalletId} />
        ) : (
          <p className="text-muted-foreground">{t("noCycle")}</p>
        )}
      </main>
    </div>
  );
}
