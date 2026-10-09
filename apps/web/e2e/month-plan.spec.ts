import { formatTND, todayBudget } from "@mizania/core";
import type { Locator, Page } from "@playwright/test";

import { expect, expected, messages, onboardedCycle, onboardedStudent, test } from "./support";

type Locale = "ar" | "fr" | "en";

// Category names from the seed (packages/db/src/seed/default-categories.ts).
const groceries = { ar: "القضية", fr: "Courses", en: "Groceries" } as const;
const rent = { ar: "الكراء", fr: "Loyer", en: "Rent" } as const;
const recharge = { ar: "شحن التليفون", fr: "Recharge téléphone", en: "Phone recharge" } as const;

/** Clears the keypad of `sheet` and types `amount`. */
async function typeAmount(sheet: Locator, locale: Locale, amount: string) {
  const back = sheet.getByRole("button", { name: messages[locale].QuickLog.back });
  for (let i = 0; i < 10; i++) await back.click();
  for (const key of amount) {
    const label = key === "." ? messages[locale].QuickLog.decimal : key;
    await sheet.getByRole("button", { name: label, exact: true }).click();
  }
}

async function quickLog(page: Page, locale: Locale, amount: string, category: string) {
  await page.getByTestId("quick-log-open").click();
  const sheet = page.getByTestId("quick-log");
  await typeAmount(sheet, locale, amount);
  await sheet.getByTestId("quick-log-categories").getByRole("button", { name: category }).click();
  await expect(sheet).toBeHidden();
}

async function openEditor(page: Page, locale: Locale) {
  const t = messages[locale];
  await page.getByRole("navigation").getByRole("link", { name: t.Nav.plan }).click();
  await page.getByRole("link", { name: t.Plan.change }).click();
  await expect(page.getByRole("heading", { name: t.PlanEdit.title, level: 1 })).toBeVisible();
}

function editItem(page: Page, locale: Locale, name: string) {
  return page
    .getByRole("button", { name: messages[locale].PlanEdit.editLabel.replace("{name}", name) })
    .click();
}

for (const locale of ["ar", "fr", "en"] as const) {
  const t = messages[locale];
  const money = (millimes: number) => formatTND(millimes, locale);

  test(`${locale}: a groceries envelope lowers today's amount; groceries stay out of it until it's empty`, async ({
    page,
  }) => {
    await onboardedStudent(page, locale);
    await expect(page.getByTestId("today-amount")).toContainText(
      money(expected(0).budget.allowance),
    );
    const after = expected(30_000).budget;

    await openEditor(page, locale);
    // 20% of 130 DT, down to 5 DT.
    const suggestion = page.getByTestId("groceries-suggestion");
    await expect(suggestion).toContainText(money(25_000));
    await suggestion.click();
    const sheet = page.getByTestId("plan-amount-sheet");
    await expect(sheet.getByTestId("plan-amount")).toContainText("25");
    await typeAmount(sheet, locale, "30");
    // The preview follows each key.
    await expect(sheet.getByTestId("preview-today")).toContainText(money(after.allowance));
    await sheet.getByRole("button", { name: t.PlanEdit.ok, exact: true }).click();
    await expect(sheet).toBeHidden();
    await expect(page.getByTestId("plan-preview").getByTestId("preview-today")).toContainText(
      money(after.allowance),
    );
    await expect(page.getByTestId("groceries-suggestion")).toHaveCount(0);

    await page.getByRole("button", { name: t.PlanEdit.save }).click();
    await expect(page).toHaveURL(new RegExp(`/${locale}/plan$`));
    const envelope = page.getByTestId("envelope").filter({ hasText: groceries[locale] });
    await expect(envelope).toContainText(money(30_000));

    await page.getByRole("navigation").getByRole("link", { name: t.Nav.today }).click();
    await expect(page.getByTestId("today-amount")).toContainText(money(after.allowance));

    // 20 DT of groceries: from the envelope, "left today" doesn't move.
    await quickLog(page, locale, "20", groceries[locale]);
    await expect(page.getByTestId("today-expense")).toContainText(t.TodayList.covered);
    await expect(page.getByTestId("today-left")).toContainText(money(after.left));

    // 15 more: 10 left in the envelope, so 5 come from today's money.
    await quickLog(page, locale, "15", groceries[locale]);
    const left = after.allowance - 5_000;
    await expect(page.getByTestId("today-amount")).toContainText(money(after.allowance));
    await expect(page.getByTestId("today-left")).toContainText(money(Math.abs(left)));
  });
}

test("fr: a partly paid rent and a used envelope can't go below what's used", async ({ page }) => {
  const t = messages.fr;
  const money = (millimes: number) => formatTND(millimes, "fr");
  await onboardedStudent(page, "fr", { rent: "50", bills: { phone_recharge: "20" } });

  // 30 of the 50 DT of rent paid, and a 5 DT top-up from the envelope.
  await page.goto("/fr/plan");
  await page.getByRole("button", { name: t.PayFixed.payLabel.replace("{name}", rent.fr) }).click();
  const pay = page.getByTestId("pay-sheet");
  await typeAmount(pay, "fr", "30");
  await pay.getByLabel(t.PayFixed.final).uncheck();
  await pay.getByRole("button", { name: t.PayFixed.confirm, exact: true }).click();
  await expect(pay).toBeHidden();
  await page.goto("/fr");
  await quickLog(page, "fr", "5", recharge.fr);
  const todayAmount = await page.getByTestId("today-amount").innerText();

  await openEditor(page, "fr");
  const sheet = page.getByTestId("plan-amount-sheet");
  const ok = sheet.getByRole("button", { name: t.PlanEdit.ok, exact: true });

  // Rent: at least the 30 DT paid, and it stays in the plan.
  await editItem(page, "fr", rent.fr);
  await expect(sheet.getByTestId("plan-amount-min")).toContainText(money(30_000));
  await expect(sheet.getByText(t.PlanEdit.hasPayments)).toBeVisible();
  await expect(sheet.getByRole("button", { name: t.PlanEdit.remove })).toHaveCount(0);
  await typeAmount(sheet, "fr", "20");
  await expect(ok).toBeDisabled();
  await typeAmount(sheet, "fr", "40");
  await ok.click();
  await expect(sheet).toBeHidden();

  // Phone recharge: closed at the 5 DT spent, not removed.
  await editItem(page, "fr", recharge.fr);
  await expect(sheet.getByTestId("plan-amount-min")).toContainText(money(5_000));
  await expect(sheet.getByRole("button", { name: t.PlanEdit.remove })).toHaveCount(0);
  await sheet
    // The amount in the name is wrapped in Unicode isolates.
    .getByRole("button", { name: new RegExp(t.PlanEdit.closeAt.replace("{amount}", ".*5,000")) })
    .click();
  await expect(sheet).toBeHidden();

  // A smaller plan in weekly mode: today's amount stays, the rest shows from next week.
  await expect(page.getByTestId("preview-next-week")).toHaveText(t.PlanEdit.fromNextWeek);
  await page.getByRole("button", { name: t.PlanEdit.save }).click();
  await expect(page).toHaveURL(/\/fr\/plan$/);
  const rentState = page
    .getByTestId("fixed-cost")
    .filter({ hasText: rent.fr })
    .getByTestId("fixed-cost-state");
  await expect(rentState).toContainText(money(30_000));
  await expect(rentState).toContainText(money(40_000));
  const envelope = page.getByTestId("envelope").filter({ hasText: recharge.fr });
  await expect(envelope).toContainText(money(5_000));
  await expect(envelope).toContainText(money(0));

  await page.goto("/fr");
  await expect(page.getByTestId("today-amount")).toHaveText(todayAmount);
});

test("en: over budget, 'Adjust my plan' fixes the plan; the week's amount waits for next week", async ({
  page,
}) => {
  const t = messages.en;
  const money = (millimes: number) => formatTND(millimes, "en");
  await onboardedStudent(page, "en", { rent: "500" });
  await expect(page.getByTestId("today-status")).toHaveText(t.Today.status.over_budget);

  await page.getByRole("link", { name: t.Today.adjustPlan }).click();
  await expect(page).toHaveURL(/\/en\/plan\/edit\?from=today$/);
  // 500 DT of rent against 130 DT in the wallets.
  await expect(page.getByTestId("preview-over")).toContainText(money(370_000));

  await editItem(page, "en", rent.en);
  const sheet = page.getByTestId("plan-amount-sheet");
  await typeAmount(sheet, "en", "100");
  await sheet.getByRole("button", { name: t.PlanEdit.ok, exact: true }).click();
  await expect(page.getByTestId("preview-over")).toHaveCount(0);
  await expect(page.getByTestId("preview-next-week")).toHaveText(t.PlanEdit.fromNextWeek);

  await page.getByRole("button", { name: t.PlanEdit.save }).click();
  await expect(page).toHaveURL(/\/en$/);
  // This week was stored at 0 while over budget; a plan change never raises it.
  const today = todayBudget({
    ...onboardedCycle(),
    poolNow: 30_000,
    spentToday: 0,
    spentThisWeekBeforeToday: 0,
    weeklyMode: true,
    weekAllowance: 0,
  });
  expect(today.status).toBe("on_track");
  await expect(page.getByTestId("today-status")).toHaveText(t.Today.status.on_track);
  await expect(page.getByTestId("today-amount")).toContainText(money(today.allowance));
});
