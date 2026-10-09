import type { Page } from "@playwright/test";

import { expect, messages, signedInNewUser, test } from "./support";

const section = (page: Page, title: string) => page.locator("section").filter({ hasText: title });

for (const locale of ["ar", "fr", "en"] as const) {
  const t = messages[locale];
  const o = t.Onboarding;

  test(`${locale}: a new student finishes onboarding and lands home`, async ({ page }) => {
    await signedInNewUser(page, locale);

    // Signed-in pages send a new account to the wizard.
    await page.goto(`/${locale}`);
    await expect(page).toHaveURL(new RegExp(`/${locale}/onboarding$`));
    await expect(page.locator("html")).toHaveAttribute("dir", locale === "ar" ? "rtl" : "ltr");

    // 1. Language: already the page's language.
    await expect(page.getByTestId("onboarding-progress")).toHaveText(
      o.progress.replace("{step}", "1").replace("{total}", "4"),
    );
    await expect(page.getByRole("radio", { checked: true })).toHaveAttribute("lang", locale);
    await page.getByRole("button", { name: o.next }).click();

    // 2. Money from home.
    await expect(page.getByRole("heading", { name: o.money.title })).toBeVisible();
    const next = page.getByRole("button", { name: o.next });
    await expect(next).toBeDisabled();
    await page.getByLabel(o.money.amountLabel).fill("600");
    await page.getByRole("button", { name: "1", exact: true }).click();
    await expect(page.getByTestId("next-transfer")).toBeVisible();
    await next.click();

    // 3. Rent (already paid) and electricity.
    await expect(page.getByRole("heading", { name: o.fixedCosts.title })).toBeVisible();
    await page.getByLabel(o.fixedCosts.rentAmount).fill("250");
    await page.getByLabel(o.fixedCosts.alreadyPaid).first().check();
    await page.getByTestId("cost-electricity").check();
    await page.getByLabel(o.fixedCosts.amount, { exact: true }).fill("30");
    await next.click();

    // 4. Wallets: cash, D17 and a named "other" one.
    await expect(page.getByRole("heading", { name: o.wallets.title })).toBeVisible();
    await section(page, t.WalletTypes.cash).getByLabel(o.wallets.balance).fill("45.500");
    await page.getByTestId("wallet-d17").check();
    await section(page, t.WalletTypes.d17).getByLabel(o.wallets.balance).fill("120");
    const finish = page.getByRole("button", { name: o.finish });
    await page.getByTestId("wallet-other").check();
    // An "other" wallet needs a name.
    await expect(finish).toBeDisabled();
    await page.getByLabel(o.wallets.otherName).fill("Tirelire");
    await finish.click();

    await expect(page).toHaveURL(new RegExp(`/${locale}$`));
    await expect(page.getByTestId("signed-in-as")).toContainText("Amel");

    // Done: the wizard sends finished students home.
    await page.goto(`/${locale}/onboarding`);
    await expect(page).toHaveURL(new RegExp(`/${locale}$`));
  });
}

test("a reload keeps the answers and the step", async ({ page }) => {
  const o = messages.fr.Onboarding;
  await signedInNewUser(page, "fr");
  await page.goto("/fr/onboarding");

  await page.getByRole("button", { name: o.next }).click();
  await page.getByLabel(o.money.amountLabel).fill("550,500");
  await page.getByRole("button", { name: "15", exact: true }).click();
  await page.getByRole("button", { name: o.next }).click();
  await page.getByLabel(o.fixedCosts.rentAmount).fill("200");

  await page.reload();

  await expect(page).toHaveURL(/\/fr\/onboarding\?step=3$/);
  await expect(page.getByLabel(o.fixedCosts.rentAmount)).toHaveValue("200");
  await page.getByRole("button", { name: o.back }).click();
  await expect(page.getByLabel(o.money.amountLabel)).toHaveValue("550,500");
  await expect(page.getByRole("button", { name: "15", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("a step that isn't reachable yet shows the first unanswered one", async ({ page }) => {
  const o = messages.en.Onboarding;
  await signedInNewUser(page, "en");

  await page.goto("/en/onboarding?step=4");

  await expect(page.getByRole("heading", { name: o.money.title })).toBeVisible();
});

test("changing the language in step 1 keeps the answers", async ({ page }) => {
  const ar = messages.ar.Onboarding;
  const en = messages.en.Onboarding;
  await signedInNewUser(page, "ar");
  await page.goto("/ar/onboarding");

  // Answer step 2 in Arabic, then go back and switch to English.
  await page.getByRole("button", { name: ar.next }).click();
  await page.getByLabel(ar.money.amountLabel).fill("٦٠٠");
  await page.getByRole("button", { name: "5", exact: true }).click();
  await page.getByRole("button", { name: ar.back }).click();
  await page.getByRole("radio", { name: "English" }).click();

  await expect(page).toHaveURL(/\/en\/onboarding\?step=1$/);
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  await page.getByRole("button", { name: en.next }).click();
  await expect(page.getByLabel(en.money.amountLabel)).toHaveValue("٦٠٠");
});

test("a student can sign out from the wizard", async ({ page }) => {
  const t = messages.en;
  await signedInNewUser(page, "en");
  await page.goto("/en/onboarding");

  await page.getByRole("button", { name: t.Home.signOut }).click();

  await expect(page).toHaveURL(/\/en\/sign-in$/);
});

test("the phone's back button goes to the previous step", async ({ page }) => {
  const o = messages.en.Onboarding;
  await signedInNewUser(page, "en");
  await page.goto("/en/onboarding");
  await page.getByRole("button", { name: o.next }).click();
  await expect(page.getByRole("heading", { name: o.money.title })).toBeVisible();

  await page.goBack();

  await expect(page.getByRole("heading", { name: o.language.title })).toBeVisible();
  await page.goForward();
  await expect(page.getByRole("heading", { name: o.money.title })).toBeVisible();
});
