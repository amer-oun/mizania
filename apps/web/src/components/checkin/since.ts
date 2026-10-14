"use client";

import { daysBetween, type IsoDate, todayInTunis } from "@mizania/core";
import { useFormatter, useTranslations } from "next-intl";

/**
 * "since your last count (Monday)", "since your last count (earlier
 * today)", or "since you started" when the wallet was never counted.
 * Within a week the day is named; further back, its date.
 */
export function useSincePhrase() {
  const t = useTranslations("TodayList");
  const format = useFormatter();
  return (since: Date | string | null, today: IsoDate) => {
    if (since === null) return t("sinceStart");
    const at = typeof since === "string" ? new Date(since) : since;
    const days = daysBetween(todayInTunis(at), today);
    const day =
      days === 0
        ? t("earlierToday")
        : format.dateTime(
            at,
            days < 7
              ? { weekday: "long", timeZone: "Africa/Tunis" }
              : { day: "numeric", month: "long", timeZone: "Africa/Tunis" },
          );
    return t("sinceLast", { day });
  };
}
