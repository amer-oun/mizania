import {
  createVerifiedUser,
  expect,
  linkFromEmail,
  messages,
  newEmail,
  PASSWORD,
  test,
  verifySubject,
} from "./support";

for (const locale of ["fr", "en"] as const) {
  const t = messages[locale];

  test(`${locale}: a wrong password shows one clear error`, async ({ page, request }) => {
    const email = newEmail();
    await createVerifiedUser(request, { email, locale });

    await page.goto(`/${locale}/sign-in`);
    await expect(page.getByRole("heading", { name: t.Auth.signIn.title })).toBeVisible();
    await page.getByLabel(t.Auth.common.email).fill(email);
    await page.getByLabel(t.Auth.common.password, { exact: true }).fill("wrong password!");
    await page.getByRole("button", { name: t.Auth.signIn.submit }).click();

    await expect(page.locator("form").getByRole("alert")).toHaveText(t.Auth.signIn.invalid);
    await expect(page).toHaveURL(new RegExp(`/${locale}/sign-in$`));
  });
}

test("fr: signing in before confirming sends a fresh link", async ({ page, request }) => {
  const t = messages.fr;
  const email = newEmail();

  await page.goto("/fr/sign-up");
  await page.getByLabel(t.Auth.common.firstName).fill("Amel");
  await page.getByLabel(t.Auth.common.email).fill(email);
  await page.getByLabel(t.Auth.common.password, { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: t.Auth.signUp.submit }).click();
  await expect(page).toHaveURL(/\/fr\/check-email$/);
  const first = await linkFromEmail(request, email, verifySubject.fr);

  await page.goto("/fr/sign-in");
  await page.getByLabel(t.Auth.common.email).fill(email);
  await page.getByLabel(t.Auth.common.password, { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: t.Auth.signIn.submit }).click();
  await expect(page.locator("form").getByRole("alert")).toHaveText(t.Auth.signIn.notVerified);

  await expect.poll(() => linkFromEmail(request, email, verifySubject.fr)).not.toBe(first);
});

test("the password can be shown and hidden", async ({ page }) => {
  const t = messages.en;
  await page.goto("/en/sign-in");
  const password = page.getByLabel(t.Auth.common.password, { exact: true });
  await expect(password).toHaveAttribute("type", "password");
  await page.getByRole("button", { name: t.Auth.common.showPassword }).click();
  await expect(password).toHaveAttribute("type", "text");
});
