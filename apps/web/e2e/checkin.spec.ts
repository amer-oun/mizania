import { formatTND } from "@mizania/core";
import type { Page } from "@playwright/test";

import { expect, expected, messages, onboardedStudent, test } from "./support";

type Locale = "ar" | "fr" | "en";

// Category names from the seed (packages/db/src/seed/default-categories.ts).
const coffee = { ar: "القهوة", fr: "Café", en: "Coffee" } as const;

/** Wallets tab → "Count my cash": the count sheet of the cash wallet, at any time of day. */
async function countCash(page: Page, locale: Locale, amount: string) {
  const t = messages[locale];
  await page.getByRole("navigation").getByRole("link", { name: t.Nav.wallets }).click();
  await page.getByRole("link", { name: t.Wallets.countCash }).click();
  const sheet = page.getByTestId("count-sheet");
  await expect(sheet).toBeVisible();
  for (const key of amount) {
    const label = key === "." ? t.QuickLog.decimal : key;
    await sheet.getByRole("button", { name: label, exact: true }).click();
  }
  await sheet.getByRole("button", { name: t.Checkin.done, exact: true }).click();
  return sheet;
}

async function closeAndGoToday(page: Page, locale: Locale) {
  const t = messages[locale];
  await page
    .getByTestId("count-result")
    .getByRole("button", { name: t.Checkin.close, exact: true })
    .click();
  await page.goto(`/${locale}`);
}

// The onboarded student has 10 DT in cash (130 DT in all), weekly mode.

test("ar: less cash than expected is unlogged spending since you started", async ({ page }) => {
  const t = messages.ar;
  const money = (millimes: number) => formatTND(millimes, "ar");
  await onboardedStudent(page, "ar");
  const before = expected(0).budget;

  const sheet = await countCash(page, "ar", "7");
  const result = sheet.getByTestId("count-result");
  await expect(result).toContainText(money(3_000));
  await expect(result).toContainText(t.TodayList.sinceStart);
  await closeAndGoToday(page, "ar");

  // Today's amount stays; 3 DT less is left today.
  const after = expected(0, 3_000).budget;
  expect(after.allowance).toBe(before.allowance);
  await expect(page.getByTestId("today-amount")).toContainText(money(before.allowance));
  await expect(page.getByTestId("today-left")).toContainText(money(Math.abs(after.left)));
  const row = page.getByTestId("today-expense");
  await expect(row).toContainText(t.TodayList.unlogged);
  await expect(row.getByTestId("unlogged-since")).toHaveText(t.TodayList.sinceStart);
  await expect(page.getByTestId("checkin-done")).toContainText(
    t.Checkin.resultSpent.replace("{amount}", "").trim(),
  );

  // A category, picked later.
  await row.getByRole("button", { name: t.TodayList.pickCategory }).click();
  await page.getByTestId("pick-category").getByRole("button", { name: coffee.ar }).click();
  await expect(row).toContainText(coffee.ar);
  await expect(row.getByTestId("unlogged-since")).toContainText(t.TodayList.sinceStart);
});

test("fr: more cash, money received; counting again matches", async ({ page }) => {
  const t = messages.fr;
  const money = (millimes: number) => formatTND(millimes, "fr");
  await onboardedStudent(page, "fr");
  const before = expected(0).budget;

  const sheet = await countCash(page, "fr", "15");
  const result = sheet.getByTestId("count-result");
  await expect(result).toContainText(money(5_000));
  await result.getByRole("button", { name: t.Checkin.moreIncome }).click();
  await result.getByText(t.Received.sources.parents, { exact: true }).click();
  await result.getByRole("button", { name: t.Checkin.saveIncome }).click();
  await expect(result).toContainText(money(5_000));
  await expect(result.getByRole("button", { name: t.Checkin.moreIncome })).toHaveCount(0);
  // Weekly mode: "+5 DT · shows in your daily amount from next week".
  await expect(result.getByTestId("count-next-week")).toContainText(money(5_000));
  await closeAndGoToday(page, "fr");

  // Not spending: in weekly mode the week's amount stays; the money is in the wallets.
  await expect(page.getByTestId("today-amount")).toContainText(money(before.allowance));
  await page.getByTestId("today-amount").click();
  await expect(page.getByTestId("breakdown-wallets")).toContainText(money(135_000));
  await page.keyboard.press("Escape");

  const again = await countCash(page, "fr", "15");
  await expect(again.getByTestId("count-result")).toContainText(
    t.Checkin.match.replace("{wallet}", messages.fr.WalletTypes.cash),
  );
});

test("en: an exact count, then undo", async ({ page }) => {
  const t = messages.en;
  await onboardedStudent(page, "en");
  const sheet = await countCash(page, "en", "10");
  await expect(sheet.getByTestId("count-result")).toContainText(
    t.Checkin.match.replace("{wallet}", t.WalletTypes.cash),
  );
  await closeAndGoToday(page, "en");

  const done = page.getByTestId("checkin-done");
  await expect(done).toContainText(t.Checkin.resultMatch);
  await done.getByRole("button", { name: t.Checkin.undo }).click();
  await expect(done).toHaveCount(0);
});

test("en: a correction, a second count since the first, and undo of the latest", async ({
  page,
}) => {
  const t = messages.en;
  const money = (millimes: number) => formatTND(millimes, "en");
  await onboardedStudent(page, "en");

  // 12 counted: 2 more. "I miscounted earlier": a correction, not income.
  const sheet = await countCash(page, "en", "12");
  const result = sheet.getByTestId("count-result");
  await result.getByRole("button", { name: t.Checkin.moreCorrection }).click();
  await expect(result).toContainText(money(2_000));
  await closeAndGoToday(page, "en");

  // 11 counted: 1 spent since the count earlier today.
  const second = await countCash(page, "en", "11");
  await expect(second.getByTestId("count-result")).toContainText(
    t.TodayList.sinceLast.replace("{day}", t.TodayList.earlierToday),
  );
  await closeAndGoToday(page, "en");
  await expect(page.getByTestId("unlogged-since")).toHaveText(
    t.TodayList.sinceLast.replace("{day}", t.TodayList.earlierToday),
  );

  // Undo the latest: the unlogged spending goes, the correction stays.
  await page.getByTestId("checkin-done").getByRole("button", { name: t.Checkin.undo }).click();
  await expect(page.getByTestId("today-expense")).toHaveCount(0);
  await expect(page.getByTestId("checkin-done")).toContainText(money(2_000));
});
