import type messages from "../messages/en.json";
import type { routing } from "./i18n/routing";

// Type-safe locales and message keys for next-intl. en.json is the reference.
declare module "next-intl" {
  interface AppConfig {
    Locale: (typeof routing.locales)[number];
    Messages: typeof messages;
  }
}
