"use client";

import type { CategorySpending } from "@mizania/core";
import type { InsightCategory, MonthCategories } from "@mizania/db/insights";
import { useLocale, useTranslations } from "next-intl";

import { CategoryIcon } from "@/components/quick-log/category-icon";
import { Amount, useFormatAmount } from "@/components/wallets/shared";

/**
 * This month by category (decision 12). Every number comes from
 * packages/core through getMonthByCategory. The comparison with last month
 * is neutral: spending more isn't shown in red.
 */
export function MonthScreen({ data }: { data: MonthCategories }) {
  const t = useTranslations("Month");
  const formatAmount = useFormatAmount();
  const { month } = data;
  const byId = new Map(data.categories.map((c) => [c.id, c]));
  const isFixed = (row: CategorySpending) =>
    row.categoryId !== null && byId.get(row.categoryId)?.group === "fixed";

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-1 rounded-xl border p-4" data-testid="month-total">
        <p className="text-sm text-muted-foreground">{t("total")}</p>
        <Amount millimes={month.total} className="text-3xl font-bold" />
        <p className="text-sm text-muted-foreground" data-testid="month-compare">
          {month.lastMonthTotal === null
            ? t("firstMonth")
            : month.lastMonthWhole
              ? t("compareWhole", { amount: formatAmount(month.lastMonthTotal) })
              : t("compare", { day: month.day, amount: formatAmount(month.lastMonthTotal) })}
        </p>
        <p className="text-xs text-muted-foreground">{t("day", { day: month.day })}</p>
      </section>

      {month.rows.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground" data-testid="month-empty">
          {t("empty")}
        </p>
      ) : (
        <>
          <Group
            title={t("everyDay")}
            rows={month.rows.filter((r) => !isFixed(r))}
            byId={byId}
            total={month.total}
          />
          <Group
            title={t("fixed")}
            rows={month.rows.filter(isFixed)}
            byId={byId}
            total={month.total}
          />
        </>
      )}
    </div>
  );
}

function Group({
  title,
  rows,
  byId,
  total,
}: {
  title: string;
  rows: CategorySpending[];
  byId: Map<string, InsightCategory>;
  total: number;
}) {
  const t = useTranslations("Month");
  const locale = useLocale();
  const formatAmount = useFormatAmount();
  if (rows.length === 0) return null;

  const compared = (row: CategorySpending, lastMonth: number) => {
    const difference = row.spent - lastMonth;
    if (difference === 0) return t("same");
    return difference > 0
      ? t("more", { amount: formatAmount(difference) })
      : t("less", { amount: formatAmount(-difference) });
  };

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-medium text-muted-foreground">{title}</h2>
      <ul className="flex flex-col divide-y rounded-xl border">
        {rows.map((row) => {
          const category = row.categoryId === null ? undefined : byId.get(row.categoryId);
          return (
            <li
              key={row.categoryId ?? "unlogged"}
              className="flex flex-col gap-1.5 px-4 py-3"
              data-testid="month-row"
              data-category={category?.key ?? "unlogged"}
            >
              <div className="flex items-center gap-3">
                <CategoryIcon name={category?.icon ?? ""} className="text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {category ? category.names[locale] : t("unlogged")}
                </span>
                <Amount
                  millimes={row.spent}
                  className="text-sm font-medium"
                  data-testid="month-row-spent"
                />
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                <div
                  className="h-full rounded-full bg-primary"
                  style={{
                    // Display only: this category's share of the month's spending.
                    width: `${total > 0 ? (row.spent / total) * 100 : 0}%`,
                  }}
                />
              </div>
              {row.lastMonth !== null && (
                <p className="text-xs text-muted-foreground" data-testid="month-row-last">
                  {t("lastMonth", { amount: formatAmount(row.lastMonth) })} ·{" "}
                  {compared(row, row.lastMonth)}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
