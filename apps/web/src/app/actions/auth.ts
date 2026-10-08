"use server";

import { headers } from "next/headers";
import { hasLocale } from "next-intl";

import { redirect } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { getAuth } from "@/lib/auth";

// The page passes its locale: next-intl's getLocale() reads the [locale]
// root param, which isn't available inside server actions.
export async function signOut(locale: string) {
  // nextCookies() clears the session cookie from inside the server action.
  await getAuth().api.signOut({ headers: await headers() });
  redirect({ href: "/sign-in", locale: hasLocale(routing.locales, locale) ? locale : "ar" });
}
