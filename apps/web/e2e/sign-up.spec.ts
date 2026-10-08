import {
  expect,
  linkFromEmail,
  messages,
  newEmail,
  PASSWORD,
  test,
  verifySubject,
} from "./support";

const t = messages.ar;

test("sign up in Arabic, confirm from the email, land signed in, sign out", async ({
  page,
  request,
}) => {
  const email = newEmail();

  await page.goto("/ar/sign-up");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByRole("heading", { name: t.Auth.signUp.title })).toBeVisible();

  await page.getByLabel(t.Auth.common.firstName).fill("أمل");
  await page.getByLabel(t.Auth.common.email).fill(email);
  await page.getByLabel(t.Auth.common.password, { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: t.Auth.signUp.submit }).click();

  await expect(page).toHaveURL(/\/ar\/check-email$/);
  await expect(page.getByRole("heading", { name: t.Auth.checkEmail.title })).toBeVisible();
  await expect(page.getByTestId("check-email-body")).toContainText(email);
  await expect(page.getByTestId("spam-hint")).toHaveText(t.Auth.common.spamHint);
  // Just sent: resending waits a minute.
  await expect(page.getByRole("button", { name: /\d/ })).toBeDisabled();

  // The link from the email signs in and returns to the app.
  await page.goto(await linkFromEmail(request, email, verifySubject.ar));
  await expect(page).toHaveURL(/\/ar\/verify-email$/);
  await expect(
    page.getByRole("heading", { name: t.Auth.verifyEmail.confirmedTitle }),
  ).toBeVisible();

  await page.getByRole("link", { name: t.Auth.verifyEmail.continue }).click();
  await expect(page).toHaveURL(/\/ar$/);
  await expect(page.getByTestId("signed-in-as")).toContainText("أمل");

  await page.getByRole("button", { name: t.Home.signOut }).click();
  await expect(page).toHaveURL(/\/ar\/sign-in$/);

  // Signed out: the home page shows the welcome page instead.
  await page.goto("/ar");
  await expect(page).toHaveURL(/\/ar\/welcome$/);
});

test("signing up again with the same email looks exactly the same", async ({ page }) => {
  const email = newEmail();
  for (let i = 0; i < 2; i++) {
    await page.goto("/ar/sign-up");
    await page.getByLabel(t.Auth.common.firstName).fill("أمل");
    await page.getByLabel(t.Auth.common.email).fill(email);
    await page.getByLabel(t.Auth.common.password, { exact: true }).fill(PASSWORD);
    await page.getByRole("button", { name: t.Auth.signUp.submit }).click();
    await expect(page).toHaveURL(/\/ar\/check-email$/);
  }
});
