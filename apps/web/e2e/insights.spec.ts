import { addDays, formatTND, runOutWarning, todayInTunis } from "@mizania/core";

import { addSpending, backdateMonth, expect, messages, onboardedStudent, test } from "./support";

// The onboarded student has 130 DT and no fixed costs: all of it is daily money.

test("en: a first month shows this month by category, with nothing to compare", async ({
  page,
}) => {
  const t = messages.en;
  const money = (millimes: number) => formatTND(millimes, "en");
  await onboardedStudent(page, "en");
  // Today is day 12.
  await backdateMonth(page, 11, addDays(todayInTunis(), 19));
  await addSpending(page, [
    { daysAgo: 10, millimes: 4_000, category: "coffee" },
    { daysAgo: 5, millimes: 2_000, category: "transport" },
    { daysAgo: 2, millimes: 3_000, category: "coffee" },
  ]);

  await page.goto("/en");
  await page.getByRole("link", { name: t.Today.monthLink }).click();
  await expect(page.getByRole("heading", { name: t.Month.title, level: 1 })).toBeVisible();
  await expect(page.getByTestId("month-total")).toContainText(money(9_000));
  await expect(page.getByTestId("month-compare")).toHaveText(t.Month.firstMonth);
  const rows = page.getByTestId("month-row");
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toHaveAttribute("data-category", "coffee");
  await expect(rows.nth(0).getByTestId("month-row-spent")).toHaveText(money(7_000));
  await expect(rows.nth(1)).toHaveAttribute("data-category", "transport");
  await expect(page.getByTestId("month-row-last")).toHaveCount(0);
});

test("fr: a later month is compared with last month on the same day", async ({ page }) => {
  const t = messages.fr;
  const money = (millimes: number) => formatTND(millimes, "fr");
  await onboardedStudent(page, "fr");
  // This month started 11 days ago (today is day 12); last month ran 30 days before it.
  await backdateMonth(page, 11, addDays(todayInTunis(), 19));
  await addSpending(
    page,
    [
      { daysAgo: 40, millimes: 5_000, category: "coffee", lastMonth: true }, // day 2
      { daysAgo: 35, millimes: 2_000, category: "transport", lastMonth: true }, // day 7
      { daysAgo: 25, millimes: 6_000, category: "coffee", lastMonth: true }, // day 17: later
      { daysAgo: 3, millimes: 9_000, category: "coffee" },
    ],
    { startedDaysAgo: 41, endedDaysAgo: 11 },
  );

  await page.goto("/fr/plan");
  await page.getByRole("link", { name: t.Plan.monthLink }).click();
  await expect(page.getByRole("heading", { name: t.Month.title, level: 1 })).toBeVisible();
  await expect(page.getByTestId("month-total")).toContainText(money(9_000));
  // Day 12 of last month: 5 + 2 DT.
  await expect(page.getByTestId("month-compare")).toContainText(money(7_000));
  await expect(page.getByTestId("month-compare")).toContainText("12");
  // Amounts sit in Unicode isolates, right after the sign.
  const coffee = page.locator('[data-category="coffee"]');
  await expect(coffee.getByTestId("month-row-last")).toContainText(money(5_000));
  await expect(coffee.getByTestId("month-row-last")).toContainText(`+⁨${money(4_000)}`);
  // Spent last month only: shown at 0, and how much less.
  const transport = page.locator('[data-category="transport"]');
  await expect(transport.getByTestId("month-row-spent")).toHaveText(money(0));
  await expect(transport.getByTestId("month-row-last")).toContainText(`−⁨${money(2_000)}`);
});

// Three finished days at `perDay`, and the money expected in 27 days.
const warningCases = [
  // 112 DT left at 6 DT a day: 18 days of 27. 4.148 DT a day fits: 1.852 DT less.
  { locale: "en", perDay: 6_000, tone: "normal" },
  // 94 DT left at 12 DT a day: 3.481 DT a day fits, a cut of more than half the pace.
  { locale: "fr", perDay: 12_000, tone: "big" },
  // 10 DT left for 27 days: under 1 DT a day.
  { locale: "ar", perDay: 40_000, tone: "tight" },
] as const;

for (const { locale, perDay, tone } of warningCases) {
  test(`${locale}: a fast pace shows when the money runs out (${tone})`, async ({ page }) => {
    const money = (millimes: number) => formatTND(millimes, locale);
    const today = todayInTunis();
    const nextTransferOn = addDays(today, 27);
    await onboardedStudent(page, locale);
    await backdateMonth(page, 3, nextTransferOn);
    await addSpending(
      page,
      [3, 2, 1].map((daysAgo) => ({ daysAgo, millimes: perDay, category: "coffee" })),
    );
    const warning = runOutWarning({
      today,
      nextTransferOn,
      poolNow: 130_000 - 3 * perDay,
      recentDailySpending: [perDay, perDay, perDay],
    });
    expect(warning?.tone).toBe(tone);

    await page.goto(`/${locale}`);
    const card = page.getByTestId("run-out");
    await expect(card).toHaveAttribute("data-tone", tone);
    if (warning?.tone === "normal") {
      await expect(card).toContainText(money(warning.cutPerDay));
      await expect(card).toContainText(`${String(warning.daysShort)} days before`);
    } else if (warning?.tone === "big") {
      await expect(card).toContainText(money(warning.aimPerDay));
      await expect(card).toContainText(money(warning.pace));
    } else if (warning?.tone === "tight") {
      await expect(card).toContainText(money(warning.left));
      await expect(card).toContainText("27 يوم");
    }
  });
}

test("en: no warning before 3 finished days, even at a fast pace", async ({ page }) => {
  await onboardedStudent(page, "en");
  await backdateMonth(page, 2, addDays(todayInTunis(), 27));
  await addSpending(page, [
    { daysAgo: 2, millimes: 40_000, category: "coffee" },
    { daysAgo: 1, millimes: 40_000, category: "coffee" },
  ]);
  await page.goto("/en");
  await expect(page.getByTestId("today-amount")).toBeVisible();
  await expect(page.getByTestId("run-out")).toHaveCount(0);
});
