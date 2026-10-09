"use client";

import type { IsoDate } from "@mizania/core";
import type { Plan, PlanEnvelope, PlanFixedCost } from "@mizania/db/plan";
import { CheckIcon } from "lucide-react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { CategoryIcon } from "@/components/quick-log/category-icon";
import { Amount, useFormatAmount } from "@/components/wallets/shared";

/** Noon UTC is the same calendar day in Tunis. */
const asDate = (day: IsoDate) => new Date(`${day}T12:00:00Z`);

/** A plan item's name: its category's in this language, or the name typed. */
export function usePlanItemName() {
  const locale = useLocale();
  return (item: Pick<PlanFixedCost, "names" | "name">) => item.names?.[locale] ?? item.name ?? "";
}

/** What's paid of a fixed cost, in words. */
function FixedCostState({ cost }: { cost: PlanFixedCost }) {
  const t = useTranslations("Plan");
  const format = useFormatter();
  const formatAmount = useFormatAmount();
  if (cost.paid) {
    return cost.paidSoFar > 0 && cost.paidAt ? (
      <>
        {t("paidOn", {
          amount: formatAmount(cost.paidSoFar),
          date: format.dateTime(cost.paidAt, { day: "numeric", month: "short" }),
        })}
      </>
    ) : (
      <>{t("alreadyPaid")}</>
    );
  }
  if (cost.paidSoFar > 0) {
    return (
      <>
        {t("paidPart", {
          paid: formatAmount(cost.paidSoFar),
          planned: formatAmount(cost.planned),
        })}
      </>
    );
  }
  return <>{t("toPay")}</>;
}

/**
 * The plan of the current month: fixed costs (what's paid and left) and
 * envelopes. Every number comes from packages/core through getPlan.
 * `actions` renders the buttons of each fixed cost.
 */
export function PlanScreen({
  plan,
  actions,
}: {
  plan: Plan;
  actions?: (cost: PlanFixedCost) => ReactNode;
}) {
  const t = useTranslations("Plan");
  const format = useFormatter();
  const formatAmount = useFormatAmount();
  const nameOf = usePlanItemName();
  const day = (iso: IsoDate) => format.dateTime(asDate(iso), { day: "numeric", month: "long" });

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-muted-foreground">
        {t("period", { start: day(plan.cycle.startedOn), end: day(plan.cycle.expectedNextOn) })}
      </p>

      <section aria-labelledby="plan-fixed" className="flex flex-col gap-2">
        <h2 id="plan-fixed" className="text-sm font-medium text-muted-foreground">
          {t("fixedTitle")}
        </h2>
        {plan.fixedCosts.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noFixed")}</p>
        ) : (
          <ul className="flex flex-col divide-y rounded-xl border" data-testid="fixed-costs">
            {plan.fixedCosts.map((cost) => (
              <li
                key={cost.id}
                className="flex min-h-16 items-center gap-3 px-4 py-2"
                data-testid="fixed-cost"
              >
                <CategoryIcon name={cost.icon ?? ""} className="text-muted-foreground" />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium">{nameOf(cost)}</span>
                  <span
                    className="flex items-center gap-1 truncate text-xs text-muted-foreground"
                    data-testid="fixed-cost-state"
                  >
                    {cost.paid && <CheckIcon className="size-3 text-primary" aria-hidden />}
                    <FixedCostState cost={cost} />
                  </span>
                </div>
                <Amount millimes={cost.planned} className="text-sm font-semibold" />
                {actions?.(cost)}
              </li>
            ))}
          </ul>
        )}
        <p className="flex justify-between px-1 text-sm" data-testid="still-to-pay">
          <span>{t("stillToPay")}</span>
          <Amount millimes={plan.stillToPay} className="font-semibold" />
        </p>
      </section>

      {plan.envelopes.length > 0 && (
        <section aria-labelledby="plan-envelopes" className="flex flex-col gap-2">
          <h2 id="plan-envelopes" className="text-sm font-medium text-muted-foreground">
            {t("envelopesTitle")}
          </h2>
          <ul className="flex flex-col divide-y rounded-xl border" data-testid="envelopes">
            {plan.envelopes.map((envelope: PlanEnvelope, index) => (
              <li
                key={envelope.categoryId ?? `unnamed-${index}`}
                className="flex min-h-16 items-center gap-3 px-4 py-2"
                data-testid="envelope"
              >
                <CategoryIcon name={envelope.icon ?? ""} className="text-muted-foreground" />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium">{nameOf(envelope)}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {t("envelopeSpent", {
                      spent: formatAmount(envelope.spent),
                      planned: formatAmount(envelope.planned),
                    })}
                  </span>
                </div>
                <span className="text-sm">
                  {t("envelopeLeft", { amount: formatAmount(envelope.left) })}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
