import type { Db } from "@mizania/db";
import {
  accounts,
  rateLimits,
  sessions,
  type UserLocale,
  userLocales,
  users,
  verifications,
} from "@mizania/db/schema";
import { betterAuth, type BetterAuthPlugin } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { getOAuthState } from "better-auth/api";
import { z } from "zod";

import { resolveBaseURL } from "./base-url";
import type { AuthEnv } from "./env";
import { googleCredentials } from "./google";

const DAY = 60 * 60 * 24;

/** Sessions last 30 days and are renewed at most once a day when used (ADR 005). */
export const SESSION_EXPIRES_IN = 30 * DAY;
/** Students may find the email in spam the next day. */
export const VERIFICATION_LINK_EXPIRES_IN = DAY;
export const RESET_LINK_EXPIRES_IN = 60 * 60;

export type AuthEmailKind = "verify-email" | "reset-password";

/** Who an auth email goes to. */
export interface AuthEmailRecipient {
  id: string;
  name: string;
  email: string;
  locale: UserLocale;
}

/** Sends auth emails. Must never throw: failures are logged, not returned to the user. */
export interface AuthMailer {
  send(kind: AuthEmailKind, to: AuthEmailRecipient, url: string): Promise<void>;
}

export interface CreateAuthOptions {
  db: Db;
  env: Pick<
    AuthEnv,
    | "BETTER_AUTH_SECRET"
    | "BETTER_AUTH_URL"
    | "VERCEL_ENV"
    | "VERCEL_URL"
    | "VERCEL_BRANCH_URL"
    | "GOOGLE_CLIENT_ID"
    | "GOOGLE_CLIENT_SECRET"
  >;
  mailer: AuthMailer;
  /**
   * Runs email sending after the response is sent (Next.js `after`), so
   * response times don't reveal whether an account exists. Without it,
   * sending is awaited (tests).
   */
  runInBackground?: (task: Promise<unknown>) => void;
  /** Better Auth limits only in production by default; tests turn it on. */
  rateLimit?: boolean;
  /** Framework plugins, e.g. nextCookies() for server actions. Added last. */
  plugins?: BetterAuthPlugin[];
}

const isUserLocale = (value: unknown): value is UserLocale =>
  userLocales.includes(value as UserLocale);

function recipient(user: { id: string; name: string; email: string }): AuthEmailRecipient {
  const locale = (user as { locale?: unknown }).locale;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    locale: isUserLocale(locale) ? locale : "ar",
  };
}

export function createAuth({
  db,
  env,
  mailer,
  runInBackground,
  rateLimit,
  plugins = [],
}: CreateAuthOptions) {
  const google = googleCredentials(env);

  return betterAuth({
    appName: "Mizania",
    baseURL: resolveBaseURL(env),
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db, {
      provider: "pg",
      usePlural: true,
      schema: { users, sessions, accounts, verifications, rateLimits },
    }),

    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      autoSignIn: false,
      resetPasswordTokenExpiresIn: RESET_LINK_EXPIRES_IN,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: ({ user, url }) => mailer.send("reset-password", recipient(user), url),
    },
    emailVerification: {
      sendOnSignUp: true,
      // A sign-in attempt before verifying sends a fresh link.
      sendOnSignIn: true,
      autoSignInAfterVerification: true,
      expiresIn: VERIFICATION_LINK_EXPIRES_IN,
      sendVerificationEmail: ({ user, url }) => mailer.send("verify-email", recipient(user), url),
    },

    // Off on previews (see googleCredentials). Account linking keeps Better
    // Auth's default (ADR 005): Google joins an existing account only when
    // Google and our own account have both verified the email.
    ...(google && {
      socialProviders: {
        google: {
          ...google,
          // Shared phones: always let the user pick the Google account.
          prompt: "select_account",
        },
      },
    }),
    account: {
      // Google's tokens are stored only because Better Auth keeps them; we
      // never call Google APIs. Encrypted at rest with the auth secret.
      encryptOAuthTokens: true,
    },

    databaseHooks: {
      user: {
        create: {
          // New Google users: take the language of the page they started
          // from (sent as additionalData). Untrusted input, so only ar/fr/en.
          before: async (user) => {
            const state = await getOAuthState();
            const locale: unknown = state?.locale;
            if (!isUserLocale(locale)) return;
            return { data: { ...user, locale } };
          },
        },
      },
    },

    user: {
      additionalFields: {
        // Set at sign-up from the page's language; emails use it.
        locale: {
          type: "string",
          required: false,
          defaultValue: "ar",
          input: true,
          validator: { input: z.enum(userLocales) },
        },
        weeklyMode: { type: "boolean", required: false, defaultValue: true, input: false },
        checkinTime: { type: "string", required: false, defaultValue: "21:00", input: false },
        deletedAt: { type: "date", required: false, input: false, returned: false },
      },
    },

    session: {
      expiresIn: SESSION_EXPIRES_IN,
      updateAge: DAY,
    },

    rateLimit: {
      ...(rateLimit !== undefined && { enabled: rateLimit }),
      // Vercel functions share no memory.
      storage: "database",
    },

    advanced: {
      database: { generateId: "uuid" },
      // Better Auth skips the origin check under test; keep it on everywhere.
      disableOriginCheck: false,
      ...(runInBackground && { backgroundTasks: { handler: runInBackground } }),
    },

    telemetry: { enabled: false },
    plugins,
  });
}

export type Auth = ReturnType<typeof createAuth>;
