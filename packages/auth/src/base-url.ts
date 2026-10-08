import type { BetterAuthOptions } from "better-auth";

import type { AuthEnv } from "./env";

type BaseURLEnv = Pick<
  AuthEnv,
  "BETTER_AUTH_URL" | "VERCEL_ENV" | "VERCEL_URL" | "VERCEL_BRANCH_URL"
>;

/**
 * Where Better Auth lives, used for email links and to check request origins.
 *
 * - `BETTER_AUTH_URL` when set (production, local).
 * - On Vercel Preview it isn't set: accept exactly this deployment's two
 *   hosts (its unique URL and its branch URL), never all of `*.vercel.app`.
 *   Better Auth picks the one the request came to and trusts it as an origin;
 *   requests to any other host are refused.
 * - Otherwise fail: guessing from the request would trust any Host header.
 */
export function resolveBaseURL(env: BaseURLEnv): NonNullable<BetterAuthOptions["baseURL"]> {
  if (env.BETTER_AUTH_URL) return env.BETTER_AUTH_URL.replace(/\/+$/, "");

  if (env.VERCEL_ENV === "preview") {
    const allowedHosts = [env.VERCEL_URL, env.VERCEL_BRANCH_URL].filter((host): host is string =>
      Boolean(host),
    );
    if (allowedHosts.length > 0) return { allowedHosts, protocol: "https" };
  }

  throw new Error(
    "BETTER_AUTH_URL is not set. Set it in .env (http://localhost:3000) or in Vercel (Production). " +
      "Preview deployments need Vercel's system environment variables enabled.",
  );
}
