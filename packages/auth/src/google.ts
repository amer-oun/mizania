import type { AuthEnv } from "./env";

type GoogleEnv = Pick<AuthEnv, "BETTER_AUTH_URL" | "GOOGLE_CLIENT_ID" | "GOOGLE_CLIENT_SECRET">;

export interface GoogleCredentials {
  clientId: string;
  clientSecret: string;
}

/**
 * Google sign-in needs its client credentials and a fixed base URL: Google
 * only accepts the redirect URIs registered for the OAuth client (localhost
 * and production). Preview deployments (no BETTER_AUTH_URL) have neither a
 * registered URI nor a stable host, so Google stays off there.
 */
export function googleCredentials(env: GoogleEnv): GoogleCredentials | null {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.BETTER_AUTH_URL) return null;
  return { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET };
}

export function isGoogleEnabled(env: GoogleEnv): boolean {
  return googleCredentials(env) !== null;
}
