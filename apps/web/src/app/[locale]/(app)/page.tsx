import { todayInTunis } from "@mizania/core";
import { getBudget } from "@mizania/db/budget";
import { getCheckinState } from "@mizania/db/checkin";
import { getCategories, getQuickLogOptions } from "@mizania/db/expenses";
import { getWalletsOverview } from "@mizania/db/wallets";
import { ChartPieIcon } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";

import { signOut } from "@/app/actions/auth";
import { CheckinCard } from "@/components/checkin/checkin-card";
import { LanguageSwitcher } from "@/components/language-switcher";
import { TodayLog } from "@/components/quick-log/today-log";
import { ReceivedSnackbar } from "@/components/received/received-snackbar";
import { TodayScreen } from "@/components/today/today-screen";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { getDb } from "@/lib/db";
import { requireSession } from "@/lib/session";

// The home screen: how much the student can spend today.
export default async function TodayPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { user } = await requireSession();
  const t = await getTranslations("Home");
  const today = await getTranslations("Today");
  const locale = await getLocale();
  const db = getDb();
  const day = todayInTunis();
  const [budget, quickLog, categories, { wallets }, checkin] = await Promise.all([
    getBudget(db, user.id, day),
    getQuickLogOptions(db, user.id),
    getCategories(db, user.id),
    getWalletsOverview(db, user.id),
    getCheckinState(db, user.id, day),
  ]);
  // ?received=<id>: extra money was just added; offer to undo it.
  const receivedId = (await searchParams).received;
  const received = budget?.input.transactions.find(
    (t) => t.type === "income" && t.id !== undefined && t.id === receivedId,
  );

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
          <>
            <TodayScreen
              view={{
                cycleId: budget.cycle.id,
                today: day,
                expectedNextOn: budget.cycle.expectedNextOn,
                transferDue: budget.transferDue,
                summary: {
                  available: budget.summary.available,
                  reserved: budget.summary.reserved,
                  poolNow: budget.summary.poolNow,
                  spentToday: budget.summary.spentToday,
                  spentThisWeekBeforeToday: budget.summary.spentThisWeekBeforeToday,
                },
                budget: budget.today,
                waiting: budget.waiting.map((w) => w.amountMillimes),
                warning: budget.warning,
              }}
            />
            <div className="mt-4">
              <CheckinCard state={checkin} today={day} />
            </div>
          </>
        ) : (
          <p className="text-center text-muted-foreground" data-testid="no-cycle">
            {today("noCycle")}
          </p>
        )}
        <ReceivedSnackbar
          received={
            received?.id
              ? {
                  id: received.id,
                  amountMillimes: received.amountMillimes,
                  nextWeek: budget?.waiting.some((w) => w.id === received.id) ?? false,
                }
              : null
          }
        />
        <TodayLog
          options={quickLog}
          list={budget && { expenses: budget.todayExpenses, categories, wallets, today: day }}
        />
        {budget && (
          <Button asChild variant="ghost" className="mt-2 self-center">
            <Link href="/month" data-testid="month-link">
              <ChartPieIcon aria-hidden />
              {today("monthLink")}
            </Link>
          </Button>
        )}
      </main>
    </div>
  );
}
