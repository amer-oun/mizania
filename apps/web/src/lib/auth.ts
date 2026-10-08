import {
  type Auth,
  createAuth,
  createMailer,
  createSmtpSender,
  isGoogleEnabled,
  logger,
  parseAuthEnv,
} from "@mizania/auth";
import { createDb } from "@mizania/db/client";
import { nextCookies } from "better-auth/next-js";
import { after } from "next/server";

let instance: Auth | undefined;

/** Whether to show "Continue with Google" (off on preview deployments). */
export function googleEnabled(): boolean {
  return isGoogleEnabled({
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
  });
}

/**
 * The server's Better Auth instance, created on first use so `next build`
 * doesn't need the auth variables. Server-only: holds the secret and the
 * database connection.
 */
export function getAuth(): Auth {
  instance ??= build();
  return instance;
}

function build(): Auth {
  const env = parseAuthEnv();
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is not set.");

  // Vercel connects through Neon's pooled URL, which doesn't keep prepared
  // statements between transactions.
  const { db } = createDb(databaseUrl, { max: 5, prepare: false });

  return createAuth({
    db,
    env,
    mailer: createMailer({ sendEmail: createSmtpSender(env), logger }),
    // Send emails after the response: timing doesn't reveal whether an
    // account exists, and Vercel keeps the function alive until they're sent.
    runInBackground: (task) => {
      after(task);
    },
    plugins: [nextCookies()],
  });
}
