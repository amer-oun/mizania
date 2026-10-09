import { todayInTunis } from "@mizania/core";
import { getBudget } from "@mizania/db/budget";
import { getQuickLogOptions } from "@mizania/db/expenses";
import { getLocale, getTranslations } from "next-intl/server";

import { signOut } from "@/app/actions/auth";
import { LanguageSwitcher } from "@/components/language-switcher";
import { TodayLog } from "@/components/quick-log/today-log";
import { TodayScreen } from "@/components/today/today-screen";
import { Button } from "@/components/ui/button";
import { getDb } from "@/lib/db";
import { requireSession } from "@/lib/session";

// The home screen: how much the student can spend today.
export default async function TodayPage() {
  const { user } = await requireSession();
  const t = await getTranslations("Home");
  const today = await getTranslations("Today");
  const locale = await getLocale();
  const [budget, quickLog] = await Promise.all([
    getBudget(getDb(), user.id, todayInTunis()),
    getQuickLogOptions(getDb(), user.id),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 pt-[env(safe-area-inset-top)]">
      <header className="flex items-center justify-between gap-2 py-4">
        <h1 className="text-xl font-bold text-primary">{t("title")}</h1>
        <div className="flex items-center gap-1">
          <LanguageSwitcher />
          <form action={signOut.bind(null, locale)}>
            <Button type="submit" variant="ghost" size="sm">
              {t("signOut")}
            </Button>
          </form>
        </div>
      </header>
      <main className="flex flex-1 flex-col justify-center pb-6">
        {budget ? (
          <TodayScreen
            view={{
              expectedNextOn: budget.cycle.expectedNextOn,
              transferDue: budget.transferDue,
              summary: {
                available: budget.summary.available,
                reserved: budget.summary.reserved,
                poolNow: budget.summary.poolNow,
                spentToday: budget.summary.spentToday,
                spentThisWeekBeforeToday: budget.summary.spentThisWeekBeforeToday,
              },
              today: budget.today,
            }}
          />
        ) : (
          <p className="text-center text-muted-foreground" data-testid="no-cycle">
            {today("noCycle")}
          </p>
        )}
        {quickLog.wallets.length > 0 && <TodayLog options={quickLog} />}
      </main>
    </div>
  );
}
