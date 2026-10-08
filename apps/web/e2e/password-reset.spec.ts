import {
  createVerifiedUser,
  expect,
  linkFromEmail,
  messages,
  newEmail,
  PASSWORD,
  resetSubject,
  test,
} from "./support";

const t = messages.en;
const NEW_PASSWORD = "a brand new password";

test("forgot password: link by email, new password, sign in with it", async ({ page, request }) => {
  const email = newEmail();
  await createVerifiedUser(request, { email, locale: "en" });

  await page.goto("/en/sign-in");
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  await page.getByRole("link", { name: t.Auth.signIn.forgot }).click();
  await expect(page).toHaveURL(/\/en\/forgot-password$/);

  await page.getByLabel(t.Auth.common.email).fill(email);
  await page.getByRole("button", { name: t.Auth.forgotPassword.submit }).click();
  await expect(page.getByText(t.Auth.forgotPassword.sent)).toBeVisible();

  await page.goto(await linkFromEmail(request, email, resetSubject.en));
  await expect(page).toHaveURL(/\/en\/reset-password\?token=/);

  await page.getByLabel(t.Auth.resetPassword.newPassword, { exact: true }).fill(NEW_PASSWORD);
  await page.getByLabel(t.Auth.resetPassword.confirmPassword, { exact: true }).fill("not the same");
  await page.getByRole("button", { name: t.Auth.resetPassword.submit }).click();
  await expect(page.getByText(t.Auth.resetPassword.mismatch)).toBeVisible();

  await page.getByLabel(t.Auth.resetPassword.confirmPassword, { exact: true }).fill(NEW_PASSWORD);
  await page.getByRole("button", { name: t.Auth.resetPassword.submit }).click();
  await expect(page).toHaveURL(/\/en\/sign-in\?reset=done$/);
  await expect(page.getByText(t.Auth.signIn.resetDone)).toBeVisible();

  await page.getByLabel(t.Auth.common.email).fill(email);
  await page.getByLabel(t.Auth.common.password, { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: t.Auth.signIn.submit }).click();
  await expect(page.getByText(t.Auth.signIn.invalid)).toBeVisible();

  await page.getByLabel(t.Auth.common.password, { exact: true }).fill(NEW_PASSWORD);
  await page.getByRole("button", { name: t.Auth.signIn.submit }).click();
  await expect(page).toHaveURL(/\/en$/);
  await expect(page.getByTestId("signed-in-as")).toContainText("Amel");
});

test("an expired or broken reset link offers a new one", async ({ page }) => {
  await page.goto("/en/reset-password?error=INVALID_TOKEN");
  await expect(
    page.getByRole("heading", { name: t.Auth.resetPassword.expiredTitle }),
  ).toBeVisible();
  await page.getByRole("link", { name: t.Auth.resetPassword.requestNew }).click();
  await expect(page).toHaveURL(/\/en\/forgot-password$/);
});
