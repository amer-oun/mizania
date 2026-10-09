import { formatTND } from "@mizania/core";
import type { Page } from "@playwright/test";

import { expect, messages, signedInNewUser, test } from "./support";

type Locale = "ar" | "fr" | "en";

/**
 * A signed-in student who finished onboarding with cash 10, D17 at 0 and a
 * card with 120. The wizard itself is tested in onboarding.spec.ts: here its
 * saved draft is filled in and only "Finish" is clicked.
 */
async function onboardedStudent(page: Page, locale: Locale) {
  await signedInNewUser(page, locale);
  const session = await page.request.get("/api/auth/get-session");
  const { user } = (await session.json()) as { user: { id: string } };

  await page.goto(`/${locale}/onboarding`);
  const cost = { enabled: false, amount: "", paid: false };
  const draft = {
    version: 1,
    monthly: "600",
    arrivalDay: 1,
    rent: cost,
    bills: { electricity: cost, water: cost, internet: cost, phone_recharge: cost },
    cash: { balance: "10" },
    wallets: {
      d17: { enabled: true, balance: "" },
      flouci: { enabled: false, balance: "" },
      card: { enabled: true, balance: "120" },
      other: { enabled: false, balance: "" },
    },
    otherName: "",
  };
  await page.evaluate(
    ([key, value]) => {
      localStorage.setItem(key, value);
    },
    [`mizania.onboarding.${user.id}`, JSON.stringify(draft)] as const,
  );
  await page.goto(`/${locale}/onboarding?step=4`);
  await page.getByRole("button", { name: messages[locale].Onboarding.finish }).click();
  await expect(page).toHaveURL(new RegExp(`/${locale}$`));
}

const money = (locale: Locale, dinars: number) => formatTND(dinars * 1000, locale);

function walletRow(page: Page, name: string) {
  return page.getByTestId("wallet").filter({ hasText: name });
}

async function expectBalances(page: Page, locale: Locale, expected: Record<string, number>) {
  const names = Object.keys(expected);
  await expect(page.getByTestId("wallet-name")).toHaveText(names);
  for (const [name, dinars] of Object.entries(expected)) {
    await expect(walletRow(page, name).getByTestId("wallet-balance")).toHaveText(
      money(locale, dinars),
    );
  }
}

async function openMenu(page: Page, locale: Locale, name: string) {
  await page
    .getByRole("button", { name: messages[locale].Wallets.options.replace("{name}", name) })
    .click();
}

for (const locale of ["fr", "ar"] as const) {
  const t = messages[locale];
  const w = t.Wallets;
  const card = t.WalletTypes.card;
  const cash = t.WalletTypes.cash;
  const d17 = t.WalletTypes.d17;

  test(`${locale}: a cash withdrawal moves money from the card to cash, and can be undone`, async ({
    page,
  }) => {
    await onboardedStudent(page, locale);

    // The tab bar leads to the wallets.
    await page.getByRole("navigation").getByRole("link", { name: t.Nav.wallets }).click();
    await expect(page).toHaveURL(new RegExp(`/${locale}/wallets$`));
    await expect(page.getByRole("heading", { name: w.title, level: 1 })).toBeVisible();
    await expectBalances(page, locale, { [cash]: 10, [d17]: 0, [card]: 120 });
    await expect(page.getByText(w.noTransfers)).toBeVisible();

    // "Withdraw cash" opens the transfer with card → cash already picked.
    await openMenu(page, locale, card);
    await page.getByRole("menuitem", { name: w.withdraw }).click();
    await expect(page).toHaveURL(/\/wallets\/transfer\?/);
    await expect(
      page.getByTestId("transfer-from").getByRole("radio", { checked: true }),
    ).toHaveCount(1);
    await expect(page.getByTestId("transfer-to").getByRole("radio", { checked: true })).toHaveCount(
      1,
    );
    const confirm = page.getByRole("button", { name: w.confirm });
    await expect(confirm).toBeDisabled();

    await page.getByLabel(w.amount).fill("50");
    await page.getByLabel(w.note).fill("ATM");
    const preview = page.getByTestId("transfer-preview");
    await expect(preview).toContainText(money(locale, 70));
    await expect(preview).toContainText(money(locale, 60));
    await confirm.click();

    await expect(page).toHaveURL(new RegExp(`/${locale}/wallets$`));
    await expectBalances(page, locale, { [cash]: 60, [d17]: 0, [card]: 70 });
    // Balances come from the database: a reload shows the same.
    await page.reload();
    await expectBalances(page, locale, { [cash]: 60, [d17]: 0, [card]: 70 });
    const transfer = page.getByTestId("transfer");
    await expect(transfer).toHaveCount(1);
    await expect(transfer).toContainText("ATM");
    await expect(transfer).toContainText(money(locale, 50));

    await transfer.getByRole("button", { name: w.undo }).click();
    await expectBalances(page, locale, { [cash]: 10, [d17]: 0, [card]: 120 });
    await expect(page.getByText(w.noTransfers)).toBeVisible();
  });
}

test("en: add, rename, reorder, archive and restore wallets", async ({ page }) => {
  const t = messages.en;
  const w = t.Wallets;
  await onboardedStudent(page, "en");
  await page.goto("/en/wallets");

  // Add an "other" wallet: it needs a name. Card and D17 are already taken.
  await page.getByRole("button", { name: w.add }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("radio", { name: t.WalletTypes.card })).toHaveCount(0);
  await dialog.getByRole("radio", { name: t.WalletTypes.other }).check({ force: true });
  const save = dialog.getByRole("button", { name: w.save });
  await expect(save).toBeDisabled();
  await dialog.getByLabel(w.nameLabel).fill("Poste");
  await dialog.getByLabel(w.balanceLabel).fill("15");
  await save.click();
  await expect(dialog).toBeHidden();
  await expectBalances(page, "en", { Cash: 10, D17: 0, "Bank card": 120, Poste: 15 });

  // Only "other" wallets can be renamed.
  await openMenu(page, "en", "Cash");
  await expect(page.getByRole("menuitem", { name: w.rename })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await openMenu(page, "en", "Poste");
  await page.getByRole("menuitem", { name: w.rename }).click();
  await page.getByRole("dialog").getByLabel(w.nameLabel).fill("Poste card");
  await page.getByRole("dialog").getByRole("button", { name: w.save }).click();
  await expect(page.getByRole("dialog")).toBeHidden();

  // Move it up, above the card.
  await openMenu(page, "en", "Poste card");
  await page.getByRole("menuitem", { name: w.moveUp }).click();
  await expectBalances(page, "en", { Cash: 10, D17: 0, "Poste card": 15, "Bank card": 120 });

  // Archive the card: its 120 must go somewhere first. Move it to cash.
  await openMenu(page, "en", "Bank card");
  await page.getByRole("menuitem", { name: w.archive }).click();
  const archive = page.getByRole("dialog");
  await expect(archive).toContainText(money("en", 120));
  await archive.getByRole("combobox").selectOption({ label: "Cash" });
  await archive.getByRole("button", { name: w.archive }).click();
  await expect(archive).toBeHidden();
  await expectBalances(page, "en", { Cash: 130, D17: 0, "Poste card": 15 });
  await expect(page.getByText(w.archived.replace("{count}", "1"))).toBeVisible();
  // The settling transfer is listed, but can't be undone while the card is archived.
  await expect(page.getByTestId("transfer")).toHaveCount(1);
  await expect(page.getByTestId("transfer").getByRole("button", { name: w.undo })).toHaveCount(0);

  // Archive D17 (at 0) by zeroing: nothing to move.
  await openMenu(page, "en", "D17");
  await page.getByRole("menuitem", { name: w.archive }).click();
  await expect(page.getByRole("dialog")).toContainText(w.archiveEmpty);
  await page.getByRole("dialog").getByRole("button", { name: w.archive }).click();
  await expectBalances(page, "en", { Cash: 130, "Poste card": 15 });

  // Restore the card: back at the end, at 0.
  await page.getByText(w.archived.replace("{count}", "2")).click();
  await page
    .locator("details li")
    .filter({ hasText: "Bank card" })
    .getByRole("button", { name: w.restore })
    .click();
  await expectBalances(page, "en", { Cash: 130, "Poste card": 15, "Bank card": 0 });
  await page.reload();
  await expectBalances(page, "en", { Cash: 130, "Poste card": 15, "Bank card": 0 });
});

test("another student's wallet IDs are ignored", async ({ page, browser }) => {
  await onboardedStudent(page, "fr");
  await page.goto("/fr/wallets/transfer");
  const radios = page.getByTestId("transfer-from").getByRole("radio");
  await expect(radios).toHaveCount(3);
  const ids = await radios.evaluateAll((inputs) =>
    inputs.map((input) => (input as HTMLInputElement).value),
  );
  expect(ids).toHaveLength(3);

  // A second student, in another browser.
  const other = await browser.newContext({
    extraHTTPHeaders: { "x-forwarded-for": "198.51.100.251" },
  });
  const otherPage = await other.newPage();
  await onboardedStudent(otherPage, "fr");
  await otherPage.goto(`/fr/wallets/transfer?from=${ids[0]}&to=${ids[1]}`);

  // Nothing is pre-selected, and none of the first student's wallets appear.
  await expect(otherPage.getByTestId("transfer-from").getByRole("radio")).toHaveCount(3);
  await expect(otherPage.getByRole("radio", { checked: true })).toHaveCount(0);
  const shown = await otherPage
    .getByRole("radio")
    .evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value));
  for (const id of ids) expect(shown).not.toContain(id);
  // The wallet list (no IDs in its URL) doesn't mention them either.
  await otherPage.goto("/fr/wallets");
  await expect(otherPage.getByTestId("wallet")).toHaveCount(3);
  const list = await otherPage.content();
  for (const id of ids) expect(list).not.toContain(id);
  await other.close();
});
