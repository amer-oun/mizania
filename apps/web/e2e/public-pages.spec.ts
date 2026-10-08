import legalAr from "../messages/legal/ar.json" with { type: "json" };
import legalEn from "../messages/legal/en.json" with { type: "json" };
import legalFr from "../messages/legal/fr.json" with { type: "json" };
import { expect, messages, test } from "./support";

const legal = { ar: legalAr, fr: legalFr, en: legalEn };
const locales = ["ar", "fr", "en"] as const;

test.describe("welcome page", () => {
  test("signed-out visitors to / see what Mizania is, with a way in", async ({ page }) => {
    const t = messages.en;
    await page.goto("/");
    await expect(page).toHaveURL(/\/en\/welcome$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(t.Home.title);
    await expect(page.getByText(t.Welcome.points.wallets)).toBeVisible();

    await page.getByRole("link", { name: t.Welcome.signUp }).click();
    await expect(page).toHaveURL(/\/en\/sign-up$/);
  });

  test("works in Arabic, right to left, and leads to sign-in", async ({ page }) => {
    const t = messages.ar;
    await page.goto("/ar/welcome");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByText(t.Welcome.points.today)).toBeVisible();

    await page.getByRole("link", { name: t.Welcome.signIn }).click();
    await expect(page).toHaveURL(/\/ar\/sign-in$/);
  });
});

test.describe("privacy and terms", () => {
  for (const locale of locales) {
    test(`${locale}: both open without an account and are marked as drafts`, async ({ page }) => {
      for (const [path, doc] of [
        ["privacy", legal[locale].privacy],
        ["terms", legal[locale].terms],
      ] as const) {
        await page.goto(`/${locale}/${path}`);
        await expect(page).toHaveURL(new RegExp(`/${locale}/${path}$`));
        await expect(page.getByRole("heading", { level: 1 })).toHaveText(doc.title);
        await expect(page.getByTestId("legal-draft")).toHaveText(legal[locale].draft);
      }
    });
  }

  test("are linked from sign-in and sign-up", async ({ page }) => {
    const t = messages.fr;
    await page.goto("/fr/sign-in");
    await page.getByRole("contentinfo").getByRole("link", { name: t.Legal.privacy }).click();
    await expect(page).toHaveURL(/\/fr\/privacy$/);

    await page.goto("/fr/sign-up");
    // The "by creating an account" line links to the terms.
    await page.getByRole("main").getByRole("link", { name: "Conditions d'utilisation" }).click();
    await expect(page).toHaveURL(/\/fr\/terms$/);
  });
});

test.describe("Google sign-in", () => {
  test("the button sends the user to Google with this app's callback", async ({ page }) => {
    const t = messages.en;
    let authorize: URL | undefined;
    // Never actually reach Google: record the request and stop there.
    await page.route("https://accounts.google.com/**", async (route) => {
      authorize = new URL(route.request().url());
      await route.fulfill({ status: 200, contentType: "text/html", body: "<p>Google</p>" });
    });

    await page.goto("/en/sign-in");
    await page.getByRole("button", { name: t.Auth.google.continue }).click();
    await expect(page.getByText("Google", { exact: true })).toBeVisible();

    expect(authorize?.pathname).toBe("/o/oauth2/v2/auth");
    expect(authorize?.searchParams.get("client_id")).toBeTruthy();
    expect(authorize?.searchParams.get("redirect_uri")).toBe(
      "http://localhost:3000/api/auth/callback/google",
    );
    expect(authorize?.searchParams.get("prompt")).toBe("select_account");
  });

  test("the button is on sign-up too, in Arabic", async ({ page }) => {
    await page.goto("/ar/sign-up");
    await expect(
      page.getByRole("button", { name: messages.ar.Auth.google.continue }),
    ).toBeVisible();
  });

  for (const locale of ["fr", "en"] as const) {
    test(`${locale}: explains a Google sign-in that couldn't be linked or failed`, async ({
      page,
    }) => {
      const t = messages[locale];
      await page.goto(`/${locale}/sign-in?error=account_not_linked`);
      await expect(page.getByRole("alert").first()).toHaveText(t.Auth.google.accountNotLinked);

      await page.goto(`/${locale}/sign-in?error=access_denied`);
      await expect(page.getByRole("alert").first()).toHaveText(t.Auth.google.failed);
    });
  }
});
