import { headers } from "next/headers";
import { getLocale } from "next-intl/server";
import { cache } from "react";

import { redirect } from "@/i18n/navigation";
import { getAuth } from "@/lib/auth";

/** The signed-in user's session, checked against the database (once per request). */
export const getSession = cache(async () => {
  // headers() first: it marks the page as dynamic before anything else runs
  // (getAuth() needs runtime variables, which a prerender at build time lacks).
  const requestHeaders = await headers();
  return getAuth().api.getSession({ headers: requestHeaders });
});

/** For signed-in pages: the session, or a redirect to sign-in. */
export async function requireSession() {
  const session = await getSession();
  if (!session) return redirect({ href: "/sign-in", locale: await getLocale() });
  return session;
}

/** For sign-in, sign-up and forgot-password: signed-in users go home. */
export async function redirectIfSignedIn() {
  if (await getSession()) redirect({ href: "/", locale: await getLocale() });
}
