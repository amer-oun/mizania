"use client";

import type { CycleSummary, IsoDate, TodayBudget } from "@mizania/core";
import { ChevronRightIcon } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { type ReactNode, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Amount, useFormatAmount } from "@/components/wallets/shared";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

export interface TodayView {
  expectedNextOn: IsoDate;
  transferDue: boolean;
  summary: Pick<
    CycleSummary,
    "available" | "reserved" | "poolNow" | "spentToday" | "spentThisWeekBeforeToday"
  >;
  today: TodayBudget;
}

const statusStyle: Record<TodayBudget["status"], string> = {
  on_track: "bg-primary/10 text-primary",
  over_today: "bg-amber-500/15 text-amber-800 dark:text-amber-300",
  over_week: "bg-amber-500/15 text-amber-800 dark:text-amber-300",
  over_budget: "bg-destructive/10 text-destructive",
};

/** Noon UTC is the same calendar day in Tunis. */
const asDate = (day: IsoDate) => new Date(`${day}T12:00:00Z`);

/**
 * The home screen: today's spendable amount (ADR 003, ADR 006). Every number
 * comes from packages/core through getBudget; nothing is computed here.
 */
export function TodayScreen({ view }: { view: TodayView }) {
  const t = useTranslations("Today");
  const format = useFormatter();
  const formatAmount = useFormatAmount();
  const [open, setOpen] = useState(false);
  const { today, summary } = view;
  const expected = format.dateTime(asDate(view.expectedNextOn), {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  if (view.transferDue) {
    return (
      <section
        className="flex flex-col gap-2 rounded-xl border p-6 text-center"
        data-testid="transfer-due"
      >
        <p className="text-lg font-semibold">{t("transferDue", { date: expected })}</p>
        <p className="text-sm text-muted-foreground">{t("transferDueHint")}</p>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <section
        aria-labelledby="today-amount"
        className={cn(
          "flex flex-col items-center gap-3 rounded-xl border p-6 text-center",
          today.status === "over_budget" && "border-destructive/40",
        )}
      >
        {today.status === "over_budget" ? (
          <>
            <h2 id="today-amount" className="text-lg font-semibold">
              {t("overBudget", { amount: formatAmount(-summary.poolNow) })}
            </h2>
            <p className="text-sm text-muted-foreground">{t("overBudgetHint")}</p>
            <Button asChild>
              <Link href="/plan/edit?from=today">{t("adjustPlan")}</Link>
            </Button>
          </>
        ) : (
          <>
            <h2 id="today-amount" className="text-sm text-muted-foreground">
              {t("spendToday")}
            </h2>
            <button
              type="button"
              className="group flex items-center gap-1 rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              aria-haspopup="dialog"
              aria-label={`${formatAmount(today.allowance)}, ${t("breakdownHint")}`}
              data-testid="today-amount"
              onClick={() => {
                setOpen(true);
              }}
            >
              <Amount millimes={today.allowance} className="text-5xl font-bold tracking-tight" />
              <ChevronRightIcon
                aria-hidden
                className="size-5 text-muted-foreground rtl:rotate-180"
              />
            </button>
            <p className="text-sm" data-testid="today-left">
              {today.left < 0
                ? t("overToday", { amount: formatAmount(-today.left) })
                : today.status === "over_week" && today.week
                  ? t("overWeek", { days: today.week.daysLeft })
                  : t("leftToday", { amount: formatAmount(today.left) })}
            </p>
          </>
        )}
        <span
          className={cn("rounded-full px-3 py-1 text-xs font-medium", statusStyle[today.status])}
          data-testid="today-status"
        >
          {t(`status.${today.status}`)}
        </span>
      </section>

      {today.week && today.week.left >= 0 && today.status !== "over_budget" && (
        <section className="flex flex-col gap-2 rounded-xl border p-4" data-testid="week">
          <p className="text-sm">
            {t("week", {
              amount: formatAmount(today.week.left),
              days: today.week.daysLeft,
            })}
          </p>
          <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
            <div
              className="h-full rounded-full bg-primary"
              style={{
                // Display only: the share of the week's amount still left.
                width: `${today.week.allowance > 0 ? Math.min(100, (today.week.left / today.week.allowance) * 100) : 0}%`,
              }}
            />
          </div>
        </section>
      )}

      <p className="text-center text-sm text-muted-foreground">
        {t("daysLeft", { days: today.daysLeft })} · {t("expected", { date: expected })}
      </p>

      <Breakdown open={open} onOpenChange={setOpen} view={view} />
    </div>
  );
}

function Row({
  label,
  millimes,
  sign,
  strong,
  testId,
  children,
}: {
  label: string;
  millimes?: number;
  sign?: "−" | "=";
  strong?: boolean;
  testId?: string;
  children?: ReactNode;
}) {
  return (
    <div
      className={cn("flex items-baseline justify-between gap-3 py-1", strong && "font-semibold")}
    >
      <dt className="flex items-baseline gap-2">
        {sign && <span className="w-3 text-muted-foreground">{sign}</span>}
        {label}
      </dt>
      <dd data-testid={testId}>
        {millimes === undefined ? children : <Amount millimes={millimes} />}
      </dd>
    </div>
  );
}

/** How today's amount is calculated, from the values core returned. */
function Breakdown({
  open,
  onOpenChange,
  view,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  view: TodayView;
}) {
  const t = useTranslations("Today.breakdown");
  const { summary, today } = view;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t("close")} data-testid="breakdown">
        <DialogTitle>{t("title")}</DialogTitle>
        <dl className="flex flex-col text-sm">
          <Row label={t("wallets")} millimes={summary.available} testId="breakdown-wallets" />
          <Row
            label={t("setAside")}
            sign="−"
            millimes={summary.reserved.total}
            testId="breakdown-reserved"
          />
          <div className="ms-5 flex flex-col border-s ps-3 text-muted-foreground">
            <Row label={t("fixed")} millimes={summary.reserved.fixed} testId="breakdown-fixed" />
            <Row
              label={t("envelopes")}
              millimes={summary.reserved.envelopes}
              testId="breakdown-envelopes"
            />
            <Row
              label={t("savings")}
              millimes={summary.reserved.savings}
              testId="breakdown-savings"
            />
          </div>
          <div className="my-1 border-t" />
          <Row
            label={t("daily")}
            sign="="
            millimes={summary.poolNow}
            strong
            testId="breakdown-daily"
          />
          <div className="my-1 border-t" />
          {today.week ? (
            <>
              <Row
                label={t("weekAmount")}
                millimes={today.week.allowance}
                testId="breakdown-week"
              />
              <Row label={t("weekDays")} testId="breakdown-week-days">
                {today.week.daysLeft}
              </Row>
            </>
          ) : (
            <Row label={t("daysLeft")} testId="breakdown-days">
              {today.daysLeft}
            </Row>
          )}
          <div className="my-1 border-t" />
          <Row label={t("today")} millimes={today.allowance} strong testId="breakdown-today" />
          <Row label={t("spent")} millimes={today.spent} testId="breakdown-spent" />
          <Row label={t("left")} millimes={today.left} testId="breakdown-left" />
        </dl>
        <DialogDescription>{today.week ? t("weekly") : t("normal")}</DialogDescription>
      </DialogContent>
    </Dialog>
  );
}
