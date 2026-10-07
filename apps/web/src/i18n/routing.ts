import { defineRouting } from "next-intl/routing";

export const locales = ["ar", "fr", "en"] as const;
export type Locale = (typeof locales)[number];

export const routing = defineRouting({
  locales,
  // Used when the browser's Accept-Language matches none of `locales`.
  defaultLocale: "ar",
  // Every URL carries its locale (/ar, /fr, /en). Visiting "/" redirects to
  // the locale from the NEXT_LOCALE cookie, else Accept-Language, else "ar".
  localePrefix: "always",
  localeDetection: true,
});

const rtlLocales: readonly Locale[] = ["ar"];

export function getDirection(locale: Locale): "rtl" | "ltr" {
  return rtlLocales.includes(locale) ? "rtl" : "ltr";
}
