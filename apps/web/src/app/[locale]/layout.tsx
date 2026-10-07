import "../globals.css";

import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans_Arabic, Inter } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

import { DirectionProvider } from "@/components/direction-provider";
import { PwaProvider } from "@/components/pwa-provider";
import { getDirection, routing } from "@/i18n/routing";

const latin = Inter({ subsets: ["latin"], variable: "--font-latin", display: "swap" });
const arabic = IBM_Plex_Sans_Arabic({
  subsets: ["arabic"],
  weight: ["400", "500", "700"],
  variable: "--font-arabic",
  display: "swap",
});

// Prerender /ar, /fr and /en at build time.
export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Metadata");

  return {
    title: t("title"),
    description: t("description"),
    applicationName: "Mizania",
    appleWebApp: { capable: true, title: "Mizania", statusBarStyle: "default" },
    icons: {
      icon: [{ url: "/icons/icon.svg", type: "image/svg+xml" }],
      apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
    },
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

// The locale comes from the [locale] root param; src/i18n/request.ts
// validates it and returns a 404 for unknown locales.
export default async function LocaleLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale();
  const dir = getDirection(locale);

  return (
    <html lang={locale} dir={dir} className={`${latin.variable} ${arabic.variable}`}>
      <body className="min-h-dvh">
        <PwaProvider>
          <NextIntlClientProvider>
            <DirectionProvider dir={dir}>{children}</DirectionProvider>
          </NextIntlClientProvider>
        </PwaProvider>
      </body>
    </html>
  );
}
