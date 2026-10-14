import { addDays, formatTND, nextMonthExpectedOn, todayBudget, todayInTunis } from "@mizania/core";
import type { Locator, Page } from "@playwright/test";

import { backdateMonth, expect, expected, messages, onboardedStudent, test } from "./support";

type Locale = "ar" | "fr" | "en";

// Category names from the seed (packages/db/src/seed/default-categories.ts).
const rent = { ar: "الكراء", fr: "Loyer", en: "Rent" } as const;

async function typeAmount(scope: Locator | Page, locale: Locale, amount: string) {
  for (const key of amount) {
    const label = key === "." ? messages[locale].QuickLog.decimal : key;
    await scope.getByRole("button", { name: label, exact: true }).click();
  }
}

for (const locale of ["ar", "fr", "en"] as const) {
  const t = messages[locale];
  const money = (millimes: number) => formatTND(millimes, locale);

  test(`${locale}: extra money is added to this month, with its source`, async ({ page }) => {
    await onboardedStudent(page, locale);
    const before = expected(0).budget;
    await expect(page.getByTestId("today-amount")).toContainText(money(before.allowance));

    await page.getByRole("link", { name: t.Received.open }).click();
    await expect(page.getByRole("heading", { name: t.Received.title, level: 1 })).toBeVisible();
    // Far from the expected date: "extra money" is preselected.
    await expect(page.getByRole("radio", { name: new RegExp(t.Received.kindExtra) })).toBeChecked();
    await typeAmount(page, locale, "50");
    // The radio sits in its label; tap the label, as a student would.
    await page.getByText(t.Received.sources.bourse, { exact: true }).click();
    await expect(page.getByRole("radio", { name: t.Received.sources.bourse })).toBeChecked();
    await page.getByRole("button", { name: t.Received.save }).click();

    await expect(page).toHaveURL(new RegExp(`/${locale}\\?received=`));
    await expect(page.getByTestId("snackbar")).toContainText(money(50_000));
    // Weekly mode: the week's amount stays; the note says when it shows.
    const note = t.Today.nextWeek.split("·")[1]?.trim() ?? "";
    await expect(page.getByTestId("snackbar")).toContainText(note);
    // Weekly mode: this week's amount stays; the money is in the wallets.
    await expect(page.getByTestId("today-amount")).toContainText(money(before.allowance));
    await page.getByTestId("today-amount").click();
    await expect(page.getByTestId("breakdown-wallets")).toContainText(money(180_000));
    await expect(page.getByTestId("breakdown-next-week")).toContainText(money(50_000));

    if (locale === "en") {
      await page.keyboard.press("Escape");
      await page.getByTestId("snackbar").getByRole("button", { name: t.Received.undo }).click();
      await expect(page.getByTestId("snackbar")).toContainText(t.Received.undone);
      await page.getByTestId("today-amount").click();
      await expect(page.getByTestId("breakdown-wallets")).toContainText(money(130_000));
    }
  });
}

test("fr: money expected today; 'Yes' starts a new month from the copied plan", async ({
  page,
}) => {
  const t = messages.fr;
  const money = (millimes: number) => formatTND(millimes, "fr");
  const today = todayInTunis();
  await onboardedStudent(page, "fr", { rent: "50" });
  // The month started 25 days ago; set the money as expected today on the Plan tab.
  await backdateMonth(page, 25, addDays(today, 3));
  await page.goto("/fr/plan");
  await page.getByRole("button", { name: t.ExpectedDate.changeLabel }).click();
  const sheet = page.getByTestId("expected-date-sheet");
  await sheet.getByLabel(t.ExpectedDate.label).fill(today);
  await sheet.getByRole("button", { name: t.ExpectedDate.save }).click();
  await expect(sheet).toBeHidden();

  await page.goto("/fr");
  await expect(page.getByTestId("transfer-due")).toContainText(t.Today.arrivedTitle);
  await expect(page.getByTestId("today-amount")).toHaveCount(0);
  await page.getByRole("link", { name: t.Today.arrivedYes }).click();

  await expect(page.getByRole("radio", { name: new RegExp(t.Received.kindMonth) })).toBeChecked();
  await expect(page.getByRole("radio", { name: t.Received.sources.parents })).toBeChecked();
  await typeAmount(page, "fr", "600");
  await page.getByRole("button", { name: t.Received.next }).click();

  // The review: 130 DT left in the wallets, the rent not paid, the plan copied.
  const review = page.getByTestId("new-month");
  await expect(review.getByTestId("new-month-leftover")).toContainText(money(130_000));
  await expect(review.getByTestId("new-month-unpaid")).toContainText(rent.fr);
  const nextOn = nextMonthExpectedOn(today, Number(today.slice(8)));
  await expect(review.getByLabel(t.Received.expectedLabel)).toHaveValue(nextOn);
  await expect(page.getByTestId("plan-item").filter({ hasText: rent.fr })).toContainText(
    money(50_000),
  );
  // 130 + 600 − 50 of rent: 680 DT of daily money, from today.
  const month = todayBudget({
    today,
    startedOn: today,
    nextTransferOn: nextOn,
    poolNow: 680_000,
    spentToday: 0,
    spentThisWeekBeforeToday: 0,
    weeklyMode: true,
  });
  await expect(page.getByTestId("plan-preview").getByTestId("preview-today")).toContainText(
    money(month.allowance),
  );

  await page.getByRole("button", { name: t.Received.start }).click();
  await expect(page).toHaveURL(/\/fr$/);
  await expect(page.getByTestId("transfer-due")).toHaveCount(0);
  await expect(page.getByTestId("today-amount")).toContainText(money(month.allowance));

  await page.getByRole("navigation").getByRole("link", { name: t.Nav.plan }).click();
  await expect(
    page.getByTestId("fixed-cost").filter({ hasText: rent.fr }).getByTestId("fixed-cost-state"),
  ).toHaveText(t.Plan.toPay);
});

test("en: 'Not yet' moves the expected date, and today's amount comes back", async ({ page }) => {
  const t = messages.en;
  const today = todayInTunis();
  await onboardedStudent(page, "en");
  await backdateMonth(page, 25, today);
  await page.goto("/en");
  await expect(page.getByTestId("transfer-due")).toContainText(t.Today.arrivedTitle);

  await page.getByRole("button", { name: t.Today.arrivedNotYet }).click();
  const sheet = page.getByTestId("expected-date-sheet");
  // Two days later by default.
  await expect(sheet.getByLabel(t.ExpectedDate.label)).toHaveValue(addDays(today, 2));
  await sheet.getByRole("button", { name: t.ExpectedDate.save }).click();
  await expect(sheet).toBeHidden();

  await expect(page.getByTestId("transfer-due")).toHaveCount(0);
  await expect(page.getByTestId("today-amount")).toBeVisible();
  await expect(page.getByText(t.Today.daysLeft.replace(/\{days.*\}\}/, "2 days"))).toBeVisible();
});
