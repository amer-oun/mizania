import { accounts, rateLimits, users } from "@mizania/db/schema";
import { eq, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { SESSION_EXPIRES_IN } from "./auth";
import { createTestAuth, sessionCookie, type TestAuth } from "./test/harness";

// Better Auth end to end against a real Postgres: every request goes
// through auth.handler, as it does behind /api/auth/[...all].

const HOUR = 60 * 60 * 1000;
const password = "correct horse battery";

let t: TestAuth;
let n = 0;
const newEmail = () => `student${++n}@example.com`;

beforeAll(async () => {
  t = await createTestAuth();
});
afterAll(async () => {
  await t.test.close();
});
afterEach(() => {
  vi.useRealTimers();
});

const signUp = (email: string, extra: Record<string, unknown> = {}) =>
  t.post("/sign-up/email", {
    name: "Amel",
    email,
    password,
    locale: "fr",
    callbackURL: "/fr/verify-email",
    ...extra,
  });

const signIn = (email: string, pass = password, ip?: string) =>
  t.post(
    "/sign-in/email",
    { email, password: pass, callbackURL: "/fr/verify-email" },
    ip ? { ip } : {},
  );

const getSession = async (cookie: string) => {
  const res = await t.request("/get-session", { cookie });
  return (await res.json()) as {
    user: { email: string; emailVerified: boolean; locale: string };
    session: { expiresAt: string };
  } | null;
};

/** Signs up and opens the verification link; returns the session cookie. */
async function verifiedUser(email = newEmail()) {
  await signUp(email);
  const res = await t.request(t.lastEmail("verify-email", email).url);
  const cookie = sessionCookie(res);
  if (!cookie) throw new Error("verification did not sign in");
  return { email, cookie };
}

describe("sign-up", () => {
  it("creates an unverified user with the page's locale and app defaults, and no session", async () => {
    const email = newEmail();
    const res = await signUp(email);

    expect(res.status).toBe(200);
    expect(sessionCookie(res)).toBeUndefined();

    const [user] = await t.test.db.select().from(users).where(eq(users.email, email));
    expect(user).toMatchObject({
      name: "Amel",
      emailVerified: false,
      locale: "fr",
      weeklyMode: true,
      checkinTime: "21:00:00",
    });
  });

  it("sends exactly one verification email, in the user's language, back to the page", async () => {
    const email = newEmail();
    await signUp(email, { locale: "ar", callbackURL: "/ar/verify-email" });

    const sent = t.emails.filter((e) => e.to.email === email);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ kind: "verify-email", to: { name: "Amel", locale: "ar" } });
    const url = new URL(sent[0]?.url ?? "");
    expect(url.origin + url.pathname).toBe("http://localhost:3000/api/auth/verify-email");
    expect(url.searchParams.get("callbackURL")).toBe("/ar/verify-email");
  });

  it("rejects a locale the app doesn't have", async () => {
    const res = await signUp(newEmail(), { locale: "de" });
    expect(res.status).toBe(400);
  });

  it("ignores fields the user may not set", async () => {
    const email = newEmail();
    await signUp(email, { weeklyMode: false, emailVerified: true });
    const [user] = await t.test.db.select().from(users).where(eq(users.email, email));
    expect(user).toMatchObject({ weeklyMode: true, emailVerified: false });
  });

  it("answers the same for an existing email, without creating a second account", async () => {
    const email = newEmail();
    const first = await signUp(email);
    const second = await signUp(email, { name: "Someone else" });

    expect(second.status).toBe(first.status);
    expect(Object.keys((await second.json()) as object).sort()).toEqual(
      Object.keys((await first.json()) as object).sort(),
    );
    const rows = await t.test.db.select().from(users).where(eq(users.email, email));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.name).toBe("Amel");
  });

  it("refuses a redirect to another site", async () => {
    const res = await signUp(newEmail(), { callbackURL: "https://evil.example/phish" });
    expect(res.status).toBe(403);
  });

  it("refuses requests from another origin", async () => {
    const res = await t.post(
      "/sign-up/email",
      { name: "X", email: newEmail(), password },
      { origin: "https://evil.example" },
    );
    expect(res.status).toBe(403);
  });
});

describe("email verification", () => {
  it("blocks sign-in until verified (403), and sends a fresh link", async () => {
    const email = newEmail();
    await signUp(email);
    const before = t.emails.length;

    const res = await signIn(email);

    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "EMAIL_NOT_VERIFIED" });
    expect(sessionCookie(res)).toBeUndefined();
    expect(t.emails.slice(before)).toMatchObject([{ kind: "verify-email", to: { email } }]);
  });

  it("verifies the email, signs the user in for 30 days and returns to the page", async () => {
    const email = newEmail();
    await signUp(email);

    const res = await t.request(t.lastEmail("verify-email", email).url);

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/fr/verify-email");
    const cookie = sessionCookie(res);
    expect(cookie).toBeDefined();

    const session = await getSession(cookie ?? "");
    expect(session?.user).toMatchObject({ email, emailVerified: true, locale: "fr" });
    const expiresIn = new Date(session?.session.expiresAt ?? 0).getTime() - Date.now();
    expect(expiresIn).toBeGreaterThan((SESSION_EXPIRES_IN - 60) * 1000);
    expect(expiresIn).toBeLessThanOrEqual(SESSION_EXPIRES_IN * 1000);
  });

  it("keeps the link valid for 24 hours", async () => {
    const email = newEmail();
    await signUp(email);
    const { url } = t.lastEmail("verify-email", email);

    vi.useFakeTimers({ toFake: ["Date"], now: Date.now() + 23 * HOUR });
    const res = await t.request(url);

    expect(res.headers.get("location")).toBe("/fr/verify-email");
    expect(sessionCookie(res)).toBeDefined();
  });

  it("refuses the link after 24 hours, back on the page with an error", async () => {
    const email = newEmail();
    await signUp(email);
    const { url } = t.lastEmail("verify-email", email);

    vi.useFakeTimers({ toFake: ["Date"], now: Date.now() + 25 * HOUR });
    const res = await t.request(url);

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/fr/verify-email?error=TOKEN_EXPIRED");
    expect(sessionCookie(res)).toBeUndefined();
    const [user] = await t.test.db.select().from(users).where(eq(users.email, email));
    expect(user?.emailVerified).toBe(false);
  });

  it("refuses a tampered link", async () => {
    const email = newEmail();
    await signUp(email);
    const url = new URL(t.lastEmail("verify-email", email).url);
    url.searchParams.set("token", `${url.searchParams.get("token") ?? ""}x`);

    const res = await t.request(url.toString());

    expect(res.headers.get("location")).toBe("/fr/verify-email?error=INVALID_TOKEN");
  });

  it("resends a link on request, for the user's locale", async () => {
    const email = newEmail();
    await signUp(email, { locale: "en" });
    const before = t.emails.length;

    const res = await t.post("/send-verification-email", {
      email,
      callbackURL: "/en/verify-email",
    });

    expect(res.status).toBe(200);
    expect(t.emails.slice(before)).toMatchObject([
      { kind: "verify-email", to: { email, locale: "en" } },
    ]);
  });
});

describe("sign-in", () => {
  it("rejects a wrong password with the same answer as an unknown email", async () => {
    const { email } = await verifiedUser();

    const wrong = await signIn(email, "wrong password!");
    const unknown = await signIn("nobody@example.com");

    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(await wrong.json()).toEqual(await unknown.json());
  });

  it("creates a session with the right password", async () => {
    const { email } = await verifiedUser();

    const res = await signIn(email);

    expect(res.status).toBe(200);
    expect(await getSession(sessionCookie(res) ?? "")).toMatchObject({ user: { email } });
  });

  it("stores only a password hash", async () => {
    const { email } = await verifiedUser();
    const [row] = await t.test.db
      .select({ password: accounts.password })
      .from(accounts)
      .innerJoin(users, eq(users.id, accounts.userId))
      .where(eq(users.email, email));

    expect(row?.password).toBeTruthy();
    expect(row?.password).not.toContain(password);
  });

  it("signs out", async () => {
    const { cookie } = await verifiedUser();

    const res = await t.post("/sign-out", {}, { cookie });

    expect(res.status).toBe(200);
    expect(await getSession(cookie)).toBeNull();
  });
});

describe("password reset", () => {
  const requestReset = (email: string) =>
    t.post("/request-password-reset", { email, redirectTo: "/en/reset-password" });

  /** Opens the emailed link; returns where it redirects. */
  async function openResetLink(email: string) {
    const res = await t.request(t.lastEmail("reset-password", email).url);
    expect(res.status).toBe(302);
    return new URL(res.headers.get("location") ?? "", "http://localhost:3000");
  }

  it("emails a link in the user's language that leads to the page with a token", async () => {
    const { email } = await verifiedUser();
    await t.test.db.update(users).set({ locale: "ar" }).where(eq(users.email, email));

    const res = await requestReset(email);

    expect(res.status).toBe(200);
    expect(t.lastEmail("reset-password", email).to.locale).toBe("ar");
    const page = await openResetLink(email);
    expect(page.pathname).toBe("/en/reset-password");
    expect(page.searchParams.get("token")).toBeTruthy();
  });

  it("answers the same for an unknown email, and sends nothing", async () => {
    const before = t.emails.length;

    const res = await requestReset("nobody@example.com");

    expect(res.status).toBe(200);
    expect(t.emails.length).toBe(before);
  });

  it("sets the new password and signs out every other session", async () => {
    const { email, cookie } = await verifiedUser();
    await requestReset(email);
    const token = (await openResetLink(email)).searchParams.get("token");

    const res = await t.post("/reset-password", { newPassword: "a brand new password", token });

    expect(res.status).toBe(200);
    expect(await getSession(cookie)).toBeNull();
    expect((await signIn(email)).status).toBe(401);
    expect((await signIn(email, "a brand new password")).status).toBe(200);
  });

  it("works only once", async () => {
    const { email } = await verifiedUser();
    await requestReset(email);
    const token = (await openResetLink(email)).searchParams.get("token");
    await t.post("/reset-password", { newPassword: "first new password", token });

    const again = await t.post("/reset-password", { newPassword: "second new password", token });

    expect(again.status).toBe(400);
    expect(await again.json()).toMatchObject({ code: "INVALID_TOKEN" });
  });

  it("expires the link after 1 hour", async () => {
    const { email } = await verifiedUser();
    await requestReset(email);

    vi.useFakeTimers({ toFake: ["Date"], now: Date.now() + 61 * 60 * 1000 });
    const page = await openResetLink(email);

    expect(page.pathname).toBe("/en/reset-password");
    expect(page.searchParams.get("error")).toBe("INVALID_TOKEN");
  });

  it("refuses a password shorter than 8 characters", async () => {
    const { email } = await verifiedUser();
    await requestReset(email);
    const token = (await openResetLink(email)).searchParams.get("token");

    const res = await t.post("/reset-password", { newPassword: "short", token });

    expect(res.status).toBe(400);
  });
});

describe("emails in the background", () => {
  it("answers before the email is sent, when given a background runner", async () => {
    let release: () => void = () => undefined;
    const pending: Promise<unknown>[] = [];
    const slow = await createTestAuth({
      mailer: { send: () => new Promise<void>((resolve) => (release = resolve)) },
      runInBackground: (task) => pending.push(task),
    });
    try {
      const res = await slow.post("/sign-up/email", {
        name: "Amel",
        email: "slow@example.com",
        password,
      });

      expect(res.status).toBe(200);
      expect(pending).toHaveLength(1);
      release();
      await Promise.all(pending);
    } finally {
      await slow.test.close();
    }
  });
});

describe("rate limits", () => {
  let limited: TestAuth;
  beforeAll(async () => {
    limited = await createTestAuth({ rateLimit: true });
  });
  afterAll(async () => {
    await limited.test.close();
  });

  it("allow 3 sign-in attempts per 10 seconds per IP, stored in the database", async () => {
    const attempt = (ip: string) =>
      limited.post("/sign-in/email", { email: "x@example.com", password }, { ip });

    const statuses = [];
    for (let i = 0; i < 4; i++) statuses.push((await attempt("198.51.100.7")).status);

    expect(statuses).toEqual([401, 401, 401, 429]);
    expect((await attempt("198.51.100.8")).status).toBe(401);

    const rows = await limited.test.db
      .select({ count: rateLimits.count })
      .from(rateLimits)
      .where(sql`${rateLimits.key} like '%198.51.100.7%'`);
    expect(rows).toHaveLength(1);
  });
});
