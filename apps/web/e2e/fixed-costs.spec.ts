import { formatTND, todayBudget } from "@mizania/core";
import type { Page } from "@playwright/test";

import { expect, expected, messages, onboardedCycle, onboardedStudent, test } from "./support";

type Locale = "ar" | "fr" | "en";

// Category names from the seed (packages/db/src/seed/default-categories.ts).
const rent = { ar: "الكراء", fr: "Loyer", en: "Rent" } as const;
const steg = { ar: "الضو (الستاغ)", fr: "Électricité (STEG)", en: "Electricity (STEG)" } as const;
const recharge = { ar: "شحن التليفون", fr: "Recharge téléphone", en: "Phone recharge" } as const;

function row(page: Page, name: string) {
  return page.getByTestId("fixed-cost").filter({ hasText: name });
}

/** Opens the pay sheet of `name`, types `amount` (if given) and pays. */
async function pay(
  page: Page,
  locale: Locale,
  name: string,
  { amount, final = true }: { amount?: string; final?: boolean } = {},
) {
  const p = messages[locale].PayFixed;
  await page.getByRole("button", { name: p.payLabel.replace("{name}", name) }).click();
  const sheet = page.getByTestId("pay-sheet");
  if (amount !== undefined) {
    const back = sheet.getByRole("button", { name: messages[locale].QuickLog.back });
    for (let i = 0; i < 10; i++) await back.click();
    for (const key of amount) {
      const label = key === "." ? messages[locale].QuickLog.decimal : key;
      await sheet.getByRole("button", { name: label, exact: true }).click();
    }
  }
  if (!final) await sheet.getByLabel(p.final).uncheck();
  await sheet.getByRole("button", { name: p.confirm, exact: true }).click();
  await expect(sheet).toBeHidden();
}

for (const locale of ["ar", "fr", "en"] as const) {
  const t = messages[locale];
  const money = (millimes: number) => formatTND(millimes, locale);

  test(`${locale}: paying rent at the planned amount doesn't move today's amount`, async ({
    page,
  }) => {
    await onboardedStudent(page, locale, { rent: "50" });
    const before = expected(50_000).budget;
    await expect(page.getByTestId("today-amount")).toContainText(money(before.allowance));

    await page.getByRole("navigation").getByRole("link", { name: t.Nav.plan }).click();
    await expect(page.getByRole("heading", { name: t.Plan.title, level: 1 })).toBeVisible();
    await expect(row(page, rent[locale]).getByTestId("fixed-cost-state")).toHaveText(t.Plan.toPay);
    await expect(page.getByTestId("still-to-pay")).toContainText(money(50_000));

    // Pre-filled with the 50 DT left to pay.
    await page
      .getByRole("button", { name: t.PayFixed.payLabel.replace("{name}", rent[locale]) })
      .click();
    await expect(page.getByTestId("pay-amount")).toContainText("50");
    await page
      .getByTestId("pay-sheet")
      .getByRole("button", { name: t.PayFixed.confirm, exact: true })
      .click();

    await expect(page.getByTestId("snackbar")).toContainText(rent[locale]);
    await expect(row(page, rent[locale]).getByTestId("fixed-cost-state")).toContainText(
      money(50_000),
    );
    await expect(page.getByTestId("still-to-pay")).toContainText(money(0));

    await page.getByRole("navigation").getByRole("link", { name: t.Nav.today }).click();
    await expect(page.getByTestId("today-amount")).toContainText(money(before.allowance));
    await expect(page.getByTestId("today-left")).toContainText(money(before.left));
    const payment = page.getByTestId("today-expense");
    await expect(payment).toContainText(rent[locale]);
    await expect(payment).toContainText(t.TodayList.covered);
  });
}

test("fr: a bill 5 DT over plan lowers what's left today by 5", async ({ page }) => {
  const money = (millimes: number) => formatTND(millimes, "fr");
  await onboardedStudent(page, "fr", { bills: { electricity: "30" } });
  const before = expected(30_000).budget;

  await page.goto("/fr/plan");
  await pay(page, "fr", steg.fr, { amount: "35" });

  await page.goto("/fr");
  await expect(page.getByTestId("today-amount")).toContainText(money(before.allowance));
  // "Left" drops by 5; below 0 the screen says by how much today is overspent.
  const left = before.left - 5_000;
  await expect(page.getByTestId("today-left")).toContainText(money(Math.abs(left)));
  if (left < 0)
    await expect(page.getByTestId("today-status")).toHaveText(messages.fr.Today.status.over_today);
  await expect(page.getByTestId("today-expense")).toContainText(
    messages.fr.TodayList.partial.replace("{amount}", ""),
  );
});

test("en: a bill under plan, marked paid, frees the rest as core says", async ({ page }) => {
  await onboardedStudent(page, "en", { bills: { electricity: "30" } });
  const before = expected(30_000).budget;

  await page.goto("/en/plan");
  await pay(page, "en", steg.en, { amount: "25" });

  // Weekly mode: this week's stored amount stays; the 5 DT shows from next week.
  const after = todayBudget({
    ...onboardedCycle(),
    poolNow: 130_000 - 25_000,
    spentToday: 0,
    spentThisWeekBeforeToday: 0,
    weeklyMode: true,
    weekAllowance: before.week?.allowance,
  });
  await page.goto("/en");
  await expect(page.getByTestId("today-amount")).toContainText(formatTND(after.allowance, "en"));
});

test("en: rent in two halves, then undo the last half", async ({ page }) => {
  const p = messages.en.Plan;
  await onboardedStudent(page, "en", { rent: "50" });
  await page.goto("/en/plan");

  await pay(page, "en", rent.en, { amount: "30", final: false });
  const state = row(page, rent.en).getByTestId("fixed-cost-state");
  await expect(state).toContainText(
    p.paidPart.replace("{paid}", "").replace(" of {planned}", "").trim(),
  );
  await expect(state).toContainText(formatTND(30_000, "en"));
  await expect(page.getByTestId("still-to-pay")).toContainText(formatTND(20_000, "en"));

  // The rest is pre-filled: 20 DT.
  await pay(page, "en", rent.en);
  await expect(state).toContainText(formatTND(50_000, "en"));
  await expect(page.getByTestId("still-to-pay")).toContainText(formatTND(0, "en"));

  // Undo the last half: back to 30 of 50.
  await page
    .getByRole("button", { name: messages.en.PayFixed.undoLabel.replace("{name}", rent.en) })
    .click();
  await expect(state).toContainText(formatTND(30_000, "en"));
  await expect(page.getByTestId("still-to-pay")).toContainText(formatTND(20_000, "en"));
  await page.reload();
  await expect(page.getByTestId("still-to-pay")).toContainText(formatTND(20_000, "en"));
});

test("ar: phone recharge is an envelope: top-ups come from it, not from today's money", async ({
  page,
}) => {
  const t = messages.ar;
  await onboardedStudent(page, "ar", { bills: { phone_recharge: "20" } });
  const before = expected(20_000).budget;
  await expect(page.getByTestId("today-left")).toContainText(formatTND(before.left, "ar"));

  // It's offered in quick log; a 5 DT top-up.
  await page.getByTestId("quick-log-open").click();
  await page.getByTestId("quick-log").getByRole("button", { name: "5", exact: true }).click();
  await page.getByTestId("quick-log-categories").getByRole("button", { name: recharge.ar }).click();
  await expect(page.getByTestId("today-expense")).toContainText(t.TodayList.covered);
  await expect(page.getByTestId("today-left")).toContainText(formatTND(before.left, "ar"));

  await page.getByRole("navigation").getByRole("link", { name: t.Nav.plan }).click();
  await expect(page.getByTestId("fixed-cost")).toHaveCount(0);
  await expect(page.getByTestId("envelope")).toContainText(recharge.ar);
  await expect(page.getByTestId("envelope")).toContainText(formatTND(15_000, "ar"));
});
