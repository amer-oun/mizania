import { accounts, users } from "@mizania/db/schema";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  fakeGoogle,
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  type GoogleProfile,
} from "./test/fake-google";
import { createTestAuth, sessionCookie, type TestAuth } from "./test/harness";

// Google sign-in end to end through auth.handler, against a fake Google
// (see test/fake-google.ts) and a real Postgres.

let t: TestAuth;
let google: ReturnType<typeof fakeGoogle>;
let n = 0;

beforeAll(async () => {
  google = fakeGoogle();
  t = await createTestAuth({
    env: { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET },
  });
});
afterAll(async () => {
  google.restore();
  await t.test.close();
});

function profile(overrides: Partial<GoogleProfile> = {}): GoogleProfile {
  n++;
  return {
    sub: `google-${n}`,
    email: `google${n}@example.com`,
    email_verified: true,
    name: "Amel",
    picture: "https://lh3.googleusercontent.com/a/photo",
    ...overrides,
  };
}

/** What the "Continue with Google" button sends. */
function start(locale: string) {
  return t.post("/sign-in/social", {
    provider: "google",
    callbackURL: `/${locale}`,
    newUserCallbackURL: `/${locale}`,
    errorCallbackURL: `/${locale}/sign-in`,
    additionalData: { locale },
  });
}

/** Starts a Google sign-in, lets "Google" approve it, and follows the callback. */
async function signInWithGoogle(who: GoogleProfile, locale = "fr") {
  const res = await start(locale);
  expect(res.status).toBe(200);
  const authorize = new URL(((await res.json()) as { url: string }).url);
  const state = authorize.searchParams.get("state") ?? "";
  const cookie = res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");

  google.willReturn(who, authorize.searchParams.get("nonce") ?? "");
  return t.request(`/callback/google?code=fake-code&state=${encodeURIComponent(state)}`, {
    cookie,
  });
}

const userByEmail = async (email: string) =>
  (await t.test.db.select().from(users).where(eq(users.email, email)))[0];

const googleAccount = async (userId: string) =>
  (
    await t.test.db
      .select()
      .from(accounts)
      .where(and(eq(accounts.userId, userId), eq(accounts.providerId, "google")))
  )[0];

describe("Google sign-in", () => {
  it("sends the user to Google with this app's client and callback, asking which account", async () => {
    const res = await start("fr");
    const url = new URL(((await res.json()) as { url: string }).url);

    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("client_id")).toBe(GOOGLE_CLIENT_ID);
    expect(url.searchParams.get("redirect_uri")).toBe(
      "http://localhost:3000/api/auth/callback/google",
    );
    expect(url.searchParams.get("prompt")).toBe("select_account");
    expect(url.searchParams.get("scope")?.split(" ").sort()).toEqual([
      "email",
      "openid",
      "profile",
    ]);
  });

  it("creates a verified user in the page's language and signs them in", async () => {
    const who = profile();

    const res = await signInWithGoogle(who, "fr");

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/fr");
    expect(sessionCookie(res)).toBeDefined();
    const user = await userByEmail(who.email);
    expect(user).toMatchObject({
      name: "Amel",
      emailVerified: true,
      locale: "fr",
      weeklyMode: true,
      image: who.picture,
    });
    // No password: this account signs in with Google only.
    const rows = await t.test.db
      .select()
      .from(accounts)
      .where(eq(accounts.userId, user?.id ?? ""));
    expect(rows.map((a) => a.providerId)).toEqual(["google"]);
  });

  it("stores Google's tokens encrypted", async () => {
    const who = profile();
    await signInWithGoogle(who);
    const account = await googleAccount((await userByEmail(who.email))?.id ?? "");

    expect(account?.accountId).toBe(who.sub);
    expect(account?.accessToken).toBeTruthy();
    expect(account?.accessToken).not.toContain("fake-access-token");
  });

  it("ignores a language the app doesn't have", async () => {
    const who = profile();
    await signInWithGoogle(who, "de");
    expect((await userByEmail(who.email))?.locale).toBe("ar");
  });

  it("signs a returning Google user into the same account", async () => {
    const who = profile();
    await signInWithGoogle(who);
    const again = await signInWithGoogle(who);

    expect(sessionCookie(again)).toBeDefined();
    expect(await t.test.db.select().from(users).where(eq(users.email, who.email))).toHaveLength(1);
  });
});

describe("Google and an existing email + password account", () => {
  async function passwordUser(email: string, verify: boolean) {
    await t.post("/sign-up/email", {
      name: "Amel",
      email,
      password: "correct horse battery",
      locale: "en",
      callbackURL: "/en/verify-email",
    });
    if (verify) await t.request(t.lastEmail("verify-email", email).url);
    const user = await userByEmail(email);
    if (!user) throw new Error("no user");
    return user;
  }

  it("links Google when both sides verified the email", async () => {
    const who = profile();
    const user = await passwordUser(who.email, true);

    const res = await signInWithGoogle(who, "fr");

    expect(res.headers.get("location")).toBe("/fr");
    expect(sessionCookie(res)).toBeDefined();
    expect((await googleAccount(user.id))?.accountId).toBe(who.sub);
    // Linking keeps the account's own language.
    expect((await userByEmail(who.email))?.locale).toBe("en");
  });

  it("refuses to link to an unverified account: someone else may have registered that email", async () => {
    const who = profile();
    const user = await passwordUser(who.email, false);

    const res = await signInWithGoogle(who, "fr");

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/fr/sign-in?error=account_not_linked");
    expect(sessionCookie(res)).toBeUndefined();
    expect(await googleAccount(user.id)).toBeUndefined();
  });

  it("refuses to link when Google hasn't verified the email", async () => {
    const who = profile({ email_verified: false });
    const user = await passwordUser(who.email, true);

    const res = await signInWithGoogle(who, "fr");

    expect(res.headers.get("location")).toBe("/fr/sign-in?error=account_not_linked");
    expect(await googleAccount(user.id)).toBeUndefined();
  });
});

describe("Google on preview deployments", () => {
  let preview: TestAuth;
  beforeAll(async () => {
    preview = await createTestAuth({
      env: {
        BETTER_AUTH_URL: undefined,
        VERCEL_ENV: "preview",
        VERCEL_URL: "localhost:3000",
        GOOGLE_CLIENT_ID,
        GOOGLE_CLIENT_SECRET,
      },
    });
  });
  afterAll(async () => {
    await preview.test.close();
  });

  it("is off: there is no Google provider to start", async () => {
    const res = await preview.post("/sign-in/social", { provider: "google", callbackURL: "/fr" });
    expect(res.ok).toBe(false);
  });
});
