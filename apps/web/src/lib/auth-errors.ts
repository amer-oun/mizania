/** Errors every auth form shows the same way. */
export type CommonAuthError = "offline" | "tooMany" | "genericError";

export interface AuthCallError {
  status: number;
  code?: string | undefined;
}

/**
 * Runs an auth client call and never throws: a network failure comes back
 * as `{ error: { status: 0 } }`, like a server error.
 */
export async function attempt<
  T extends { error: { status: number; code?: string | undefined } | null },
>(call: () => Promise<T>): Promise<{ error: AuthCallError | null }> {
  try {
    const { error } = await call();
    return { error: error && { status: error.status, code: error.code } };
  } catch {
    return { error: { status: 0 } };
  }
}

export function commonError(error: AuthCallError): CommonAuthError {
  if (error.status === 0 || !navigator.onLine) return "offline";
  if (error.status === 429) return "tooMany";
  return "genericError";
}

const PENDING_EMAIL_KEY = "mizania.pendingVerificationEmail";

/**
 * Remembers the address a link was just sent to, for the "check your email"
 * screen. Kept in the tab's sessionStorage rather than the URL, so it doesn't
 * end up in history or server logs.
 */
export function rememberPendingEmail(email: string) {
  try {
    sessionStorage.setItem(PENDING_EMAIL_KEY, email);
  } catch {
    // Storage blocked (private mode): the screen then shows a generic message.
  }
}

export function readPendingEmail(): string | null {
  try {
    return sessionStorage.getItem(PENDING_EMAIL_KEY);
  } catch {
    return null;
  }
}
