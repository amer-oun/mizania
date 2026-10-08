import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";
import { hasLocale } from "next-intl";
import createMiddleware from "next-intl/middleware";

import { routing } from "./i18n/routing";

const intl = createMiddleware(routing);

/** Pages anyone can open; every other page needs a session. */
const publicPaths = [
  "/sign-in",
  "/sign-up",
  "/check-email",
  "/verify-email",
  "/forgot-password",
  "/reset-password",
];

export default function proxy(request: NextRequest) {
  const [, locale, ...rest] = request.nextUrl.pathname.split("/");
  const path = `/${rest.join("/")}`.replace(/\/+$/, "") || "/";

  // Only a quick check for a session cookie, to skip rendering for visitors
  // who are clearly signed out. Signed-in pages still check the session
  // against the database (requireSession).
  if (
    hasLocale(routing.locales, locale) &&
    !publicPaths.includes(path) &&
    !getSessionCookie(request)
  ) {
    return NextResponse.redirect(new URL(`/${locale}/sign-in`, request.url));
  }

  return intl(request);
}

export const config = {
  // Everything except API routes, Next internals, the service worker and
  // files with an extension (icons, manifest, ...).
  matcher: ["/((?!api|_next|_vercel|sw\\.js|swe-worker|.*\\..*).*)"],
};
