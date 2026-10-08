"use server";

import { headers } from "next/headers";
import { getLocale } from "next-intl/server";

import { redirect } from "@/i18n/navigation";
import { getAuth } from "@/lib/auth";

export async function signOut() {
  // nextCookies() clears the session cookie from inside the server action.
  await getAuth().api.signOut({ headers: await headers() });
  redirect({ href: "/sign-in", locale: await getLocale() });
}
