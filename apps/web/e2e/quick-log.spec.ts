import { formatTND } from "@mizania/core";
import type { Page } from "@playwright/test";

import { expect, expected, messages, onboardedStudent, test } from "./support";

type Locale = "ar" | "fr" | "en";

/** Category names from the seed (packages/db/src/seed/default-categories.ts). */
const coffee = { ar: "القهوة", fr: "Café", en: "Coffee" } as const;

async function typeAmount(page: Page, locale: Locale, keys: string) {
  const sheet = page.getByTestId("quick-log");
  for (const key of keys) {
    const name = key === "." ? messages[locale].QuickLog.decimal : key;
    await sheet.getByRole("button", { name, exact: true }).click();
  }
}

/** Taps a category by name in the quick log sheet. */
function categoryButton(page: Page, name: string) {
  return page.getByTestId("quick-log-categories").getByRole("button", { name });
}

for (const locale of ["ar", "fr", "en"] as const) {
  const t = messages[locale];
  const money = (millimes: number) => formatTND(millimes, locale);

  test(`${locale}: a coffee in three taps lowers what's left, not today's amount`, async ({
    page,
  }) => {
    await onboardedStudent(page, locale);
    const { budget } = expected(0);
    await expect(page.getByTestId("today-list-empty")).toHaveText(t.TodayList.empty);

    // Tap 1: "+".
    await page.getByTestId("quick-log-open").click();
    const sheet = page.getByTestId("quick-log");
    await expect(sheet.getByRole("heading", { name: t.QuickLog.title })).toBeVisible();
    // A new student sees coffee, transport and food out first; fixed costs never.
    const chips = sheet.getByTestId("quick-log-categories").getByRole("button");
    await expect(chips.first()).toContainText(coffee[locale]);
    // Daily and envelope categories, phone recharge included; never fixed costs.
    await expect(chips).toHaveCount(10);
    await expect(categoryButton(page, coffee[locale])).toBeDisabled();

    // The amount: 2.5.
    await typeAmount(page, locale, "2.5");
    await expect(sheet.getByTestId("quick-log-amount")).toContainText("2.5");
    // Tap 2: "Coffee" saves it.
    await categoryButton(page, coffee[locale]).click();
    await expect(sheet).toBeHidden();

    const after = expected(0, 2_500).budget;
    expect(after.allowance).toBe(budget.allowance);
    await expect(page.getByTestId("today-amount")).toContainText(money(budget.allowance));
    await expect(page.getByTestId("today-left")).toContainText(money(after.left));
    await expect(page.getByTestId("snackbar")).toContainText(coffee[locale]);
    const row = page.getByTestId("today-expense");
    await expect(row).toHaveCount(1);
    await expect(row).toContainText(coffee[locale]);
    await expect(row).toContainText(money(2_500));

    // Saved in the database: the same after a reload.
    await page.reload();
    await expect(page.getByTestId("today-left")).toContainText(money(after.left));
    await expect(page.getByTestId("today-expense")).toHaveCount(1);
  });
}

test("fr: '2500' offers 2,500 DT, and Arabic digits from a keyboard work", async ({ page }) => {
  const q = messages.fr.QuickLog;
  await onboardedStudent(page, "fr");
  await page.getByTestId("quick-log-open").click();
  const sheet = page.getByTestId("quick-log");

  await typeAmount(page, "fr", "2500");
  const chip = sheet.getByRole("button", {
    name: q.didYouMean.replace("{amount}", formatTND(2_500, "fr")),
  });
  await chip.click();
  await expect(sheet.getByTestId("quick-log-amount")).toHaveText(formatTND(2_500, "fr"));
  await expect(chip).toBeHidden();

  // A key typed afterwards goes back to reading dinars.
  await sheet.getByRole("button", { name: q.back }).click();
  await expect(sheet.getByTestId("quick-log-amount")).toContainText("250");
  await sheet.getByRole("button", { name: q.back }).click();
  await sheet.getByRole("button", { name: q.back }).click();
  await sheet.getByRole("button", { name: q.back }).click();

  // Arabic-Indic digits and the Arabic decimal separator, typed on a keyboard.
  await sheet.evaluate((element) => {
    for (const key of ["١", "٫", "٥"]) {
      element.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
    }
  });
  await expect(sheet.getByTestId("quick-log-amount")).toContainText("1.5");
  await categoryButton(page, "Transport").click();
  await expect(page.getByTestId("today-expense")).toContainText(formatTND(1_500, "fr"));
});

test("en: delete an expense, then undo", async ({ page }) => {
  const t = messages.en;
  await onboardedStudent(page, "en");
  const { budget } = expected(0);

  await page.getByTestId("quick-log-open").click();
  await typeAmount(page, "en", "4");
  await categoryButton(page, "Coffee").click();
  await expect(page.getByTestId("today-left")).toContainText(
    formatTND(expected(0, 4_000).budget.left, "en"),
  );

  // Undo right after saving removes it.
  await page.getByTestId("snackbar").getByRole("button", { name: t.QuickLog.undo }).click();
  await expect(page.getByTestId("today-list-empty")).toBeVisible();
  await expect(page.getByTestId("today-left")).toContainText(formatTND(budget.left, "en"));

  // Log it again, delete it from the list, then undo the delete.
  await page.getByTestId("quick-log-open").click();
  await typeAmount(page, "en", "4");
  await categoryButton(page, "Coffee").click();
  // The amount in the label is isolated for right-to-left text, hence the pattern.
  await page.getByRole("button", { name: /^Delete Coffee .*4\.000 DT/ }).click();
  await expect(page.getByTestId("today-list-empty")).toBeVisible();
  await expect(page.getByTestId("snackbar")).toContainText(t.QuickLog.deleted);
  await page.getByTestId("snackbar").getByRole("button", { name: t.QuickLog.undo }).click();
  await expect(page.getByTestId("today-expense")).toHaveCount(1);
  await expect(page.getByTestId("today-left")).toContainText(
    formatTND(expected(0, 4_000).budget.left, "en"),
  );
});

test("ar: another wallet can be picked, and is remembered for that category", async ({ page }) => {
  const t = messages.ar;
  const foodOut = "ماكلة برّا";
  await onboardedStudent(page, "ar");

  await page.getByTestId("quick-log-open").click();
  await page.getByTestId("quick-log").getByLabel(t.QuickLog.from).selectOption({ label: "D17" });
  await typeAmount(page, "ar", "5");
  await categoryButton(page, foodOut).click();
  await expect(page.getByTestId("today-expense")).toContainText("D17");

  // Next time, food out comes out of D17 without choosing it.
  await page.getByTestId("quick-log-open").click();
  await typeAmount(page, "ar", "3");
  await categoryButton(page, foodOut).click();
  await expect(page.getByTestId("today-expense")).toHaveCount(2);

  await page.getByRole("navigation").getByRole("link", { name: t.Nav.wallets }).click();
  const balance = (name: string) =>
    page.getByTestId("wallet").filter({ hasText: name }).getByTestId("wallet-balance");
  await expect(balance("D17")).toHaveText(formatTND(-8_000, "ar"));
  await expect(balance(t.WalletTypes.cash)).toHaveText(formatTND(10_000, "ar"));
});
