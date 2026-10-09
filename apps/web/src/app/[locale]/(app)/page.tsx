import { todayInTunis } from "@mizania/core";
import { getBudget } from "@mizania/db/budget";
import { getCategories, getQuickLogOptions } from "@mizania/db/expenses";
import { getWalletsOverview } from "@mizania/db/wallets";
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
  const db = getDb();
  const [budget, quickLog, categories, { wallets }] = await Promise.all([
    getBudget(db, user.id, todayInTunis()),
    getQuickLogOptions(db, user.id),
    getCategories(db, user.id),
    getWalletsOverview(db, user.id),
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
      {/* Room at the bottom so the "+" button never covers the last row. */}
      <main className="flex flex-1 flex-col pt-2 pb-24">
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
        <TodayLog
          options={quickLog}
          list={budget && { expenses: budget.todayExpenses, categories, wallets }}
        />
      </main>
    </div>
  );
}
