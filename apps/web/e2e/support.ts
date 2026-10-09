import { randomUUID } from "node:crypto";

import { todayInTunis } from "@mizania/core";
import { type APIRequestContext, expect, type Page, test as base } from "@playwright/test";

import ar from "../messages/ar.json" with { type: "json" };
import en from "../messages/en.json" with { type: "json" };
import fr from "../messages/fr.json" with { type: "json" };

export const messages = { ar, fr, en };
type Locale = keyof typeof messages;

const mailpit =
  process.env.MAILPIT_URL ?? `http://localhost:${process.env.MAILPIT_UI_PORT ?? 8025}`;

export const PASSWORD = "correct horse battery";

/** A fresh address for each test, so tests never see each other's emails. */
export function newEmail() {
  return `e2e-${randomUUID().slice(0, 8)}@example.com`;
}

/**
 * Each test comes from its own client IP: Better Auth limits sign-in to 3
 * tries per 10 seconds per IP, and the whole suite runs from localhost.
 */
export const test = base.extend({
  page: async ({ page }, provide) => {
    const ip = `198.51.100.${Math.floor(Math.random() * 250) + 1}`;
    await page.context().setExtraHTTPHeaders({ "x-forwarded-for": ip });
    await provide(page);
  },
});
export { expect };

interface MailpitMessage {
  ID: string;
  Subject: string;
}

/**
 * Waits for an email to `to` whose subject is `subject` (sent after the
 * response, so it may take a moment) and returns its first link.
 */
export async function linkFromEmail(
  request: APIRequestContext,
  to: string,
  subject: string,
): Promise<string> {
  let link: string | undefined;
  await expect
    .poll(
      async () => {
        const search = await request.get(`${mailpit}/api/v1/search`, {
          params: { query: `to:"${to}" subject:"${subject}"` },
        });
        const { messages: found } = (await search.json()) as { messages: MailpitMessage[] };
        const latest = found[0];
        if (!latest) return undefined;
        const message = await request.get(`${mailpit}/api/v1/message/${latest.ID}`);
        const { Text } = (await message.json()) as { Text: string };
        link = /https?:\/\/\S+/.exec(Text)?.[0];
        return link;
      },
      { message: `email "${subject}" to ${to}`, timeout: 15_000 },
    )
    .toBeTruthy();
  return link ?? "";
}

/** Creates a verified account through the API, as the sign-up screen would. */
export async function createVerifiedUser(
  request: APIRequestContext,
  { email, locale }: { email: string; locale: "ar" | "fr" | "en" },
) {
  const signUp = await request.post("/api/auth/sign-up/email", {
    headers: { "x-forwarded-for": `203.0.113.${Math.floor(Math.random() * 250) + 1}` },
    data: {
      name: "Amel",
      email,
      password: PASSWORD,
      locale,
      callbackURL: `/${locale}/verify-email`,
    },
  });
  expect(signUp.ok()).toBe(true);
  const link = await linkFromEmail(request, email, verifySubject[locale]);
  const verify = await request.get(link, { maxRedirects: 0 });
  expect(verify.status()).toBe(302);
}

/** A verified account, signed in through the API in this page's browser. */
export async function signedInNewUser(page: Page, locale: "ar" | "fr" | "en") {
  const email = newEmail();
  await createVerifiedUser(page.request, { email, locale });
  const res = await page.request.post("/api/auth/sign-in/email", {
    headers: { origin: "http://localhost:3000" },
    data: { email, password: PASSWORD },
  });
  expect(res.ok()).toBe(true);
  return email;
}

/**
 * A signed-in student who finished onboarding with cash 10, D17 at 0 and a
 * card with 120, and money expected on `arrivalDay` (default: the same day
 * next month, the longest cycle). Optionally a rent share, not yet paid,
 * and a Flouci wallet.
 * The wizard itself is tested in onboarding.spec.ts: here its saved draft is
 * filled in and only "Finish" is clicked.
 */
export async function onboardedStudent(
  page: Page,
  locale: Locale,
  {
    rent,
    flouci,
    arrivalDay = Number(todayInTunis().slice(8)),
  }: { rent?: string; flouci?: string; arrivalDay?: number } = {},
) {
  await signedInNewUser(page, locale);
  const session = await page.request.get("/api/auth/get-session");
  const { user } = (await session.json()) as { user: { id: string } };

  await page.goto(`/${locale}/onboarding`);
  const cost = { enabled: false, amount: "", paid: false };
  const draft = {
    version: 1,
    monthly: "600",
    arrivalDay,
    rent: rent ? { enabled: true, amount: rent, paid: false } : cost,
    bills: { electricity: cost, water: cost, internet: cost, phone_recharge: cost },
    cash: { balance: "10" },
    wallets: {
      d17: { enabled: true, balance: "" },
      flouci: { enabled: flouci !== undefined, balance: flouci ?? "" },
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

// Subjects from packages/auth/src/email/messages.ts.
export const verifySubject = {
  ar: "أكّد الإيميل متاعك في ميزانية",
  fr: "Confirme ton email pour Mizania",
  en: "Confirm your email for Mizania",
} as const;

export const resetSubject = {
  ar: "بدّل كلمة السر متاع ميزانية",
  fr: "Change ton mot de passe Mizania",
  en: "Reset your Mizania password",
} as const;
