import { formatTND, nextTransferDate, todayBudget, todayInTunis } from "@mizania/core";

import { expect, messages, onboardedStudent, test } from "./support";

// The onboarding in onboardedStudent: cash 10, card 120, D17 0 (130 DT in all),
// money expected on the same day next month, weekly mode (the default).
const today = todayInTunis();
const arrivalDay = Number(today.slice(8));

/** What core says for that student today, with `reserved` set aside and `spentToday` spent. */
function expected(reserved: number, spentToday = 0) {
  const available = 130_000 - spentToday;
  const budget = todayBudget({
    today,
    startedOn: today,
    nextTransferOn: nextTransferDate(today, arrivalDay),
    poolNow: available - reserved,
    spentToday,
    spentThisWeekBeforeToday: 0,
    weeklyMode: true,
  });
  return { available, poolNow: available - reserved, budget };
}

for (const locale of ["ar", "fr", "en"] as const) {
  const t = messages[locale].Today;
  const money = (millimes: number) => formatTND(millimes, locale);

  test(`${locale}: on track, with a breakdown that matches core`, async ({ page }) => {
    // 50 DT of rent still to pay.
    await onboardedStudent(page, locale, { rent: "50" });
    const { available, poolNow, budget } = expected(50_000);
    const week = budget.week;
    if (!week) throw new Error("weekly mode has a week");
    expect(budget.status).toBe("on_track");

    const amount = page.getByTestId("today-amount");
    await expect(amount).toContainText(money(budget.allowance));
    await expect(page.getByTestId("today-status")).toHaveText(t.status.on_track);
    await expect(page.getByTestId("today-left")).toContainText(money(budget.left));
    await expect(page.getByTestId("week")).toContainText(money(week.left));

    // Tapping the amount explains it, with the numbers core returned.
    await amount.click();
    const breakdown = page.getByRole("dialog");
    await expect(breakdown.getByRole("heading", { name: t.breakdown.title })).toBeVisible();
    const row = (id: string) => breakdown.getByTestId(`breakdown-${id}`);
    await expect(row("wallets")).toHaveText(money(available));
    await expect(row("reserved")).toHaveText(money(50_000));
    await expect(row("fixed")).toHaveText(money(50_000));
    await expect(row("envelopes")).toHaveText(money(0));
    await expect(row("savings")).toHaveText(money(0));
    await expect(row("daily")).toHaveText(money(poolNow));
    await expect(row("week")).toHaveText(money(week.allowance));
    await expect(row("week-days")).toHaveText(String(week.daysLeft));
    await expect(row("today")).toHaveText(money(budget.allowance));
    await expect(row("spent")).toHaveText(money(0));
    await expect(row("left")).toHaveText(money(budget.left));
    await expect(breakdown).toContainText(t.breakdown.weekly);
    await page.keyboard.press("Escape");
    await expect(breakdown).toBeHidden();

    // The same after a reload: the week's amount is stored.
    await page.reload();
    await expect(page.getByTestId("today-amount")).toContainText(money(budget.allowance));
  });
}

test("fr: money that's gone keeps today's amount and shows the overspending", async ({ page }) => {
  const t = messages.fr.Today;
  const w = messages.fr.Wallets;
  const money = (millimes: number) => formatTND(millimes, "fr");
  await onboardedStudent(page, "fr");
  const before = expected(0).budget;
  await expect(page.getByTestId("today-amount")).toContainText(money(before.allowance));

  // Archive the cash wallet: "I don't have this money any more".
  await page.goto("/fr/wallets");
  await page
    .getByRole("button", { name: w.options.replace("{name}", messages.fr.WalletTypes.cash) })
    .click();
  await page.getByRole("menuitem", { name: w.archive }).click();
  await page.getByRole("dialog").getByLabel(w.archiveZero).check();
  await page.getByRole("dialog").getByRole("button", { name: w.archive }).click();
  await expect(page.getByRole("dialog")).toBeHidden();

  await page.getByRole("navigation").getByRole("link", { name: messages.fr.Nav.today }).click();
  const after = expected(0, 10_000).budget;
  expect(after.allowance).toBe(before.allowance);
  expect(after.status).toBe("over_today");
  await expect(page.getByTestId("today-amount")).toContainText(money(before.allowance));
  await expect(page.getByTestId("today-status")).toHaveText(t.status.over_today);
  await expect(page.getByTestId("today-left")).toContainText(money(-after.left));
});

test("en: more set aside than exists is over budget", async ({ page }) => {
  const t = messages.en.Today;
  await onboardedStudent(page, "en", { rent: "500" });
  expect(expected(500_000).budget.status).toBe("over_budget");

  await expect(page.getByTestId("today-status")).toHaveText(t.status.over_budget);
  await expect(page.getByText(t.overBudgetHint)).toBeVisible();
  // 500 DT of rent against 130 DT in the wallets.
  await expect(page.getByRole("heading", { level: 2 })).toContainText(formatTND(370_000, "en"));
  await expect(page.getByTestId("today-amount")).toHaveCount(0);
});
