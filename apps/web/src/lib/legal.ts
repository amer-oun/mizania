import type { Locale } from "@/i18n/routing";

import type legalEn from "../../messages/legal/en.json";

/**
 * Where users write about their data and account deletion.
 */
export const CONTACT_EMAIL = "mizania.app.pro@gmail.com" as string;

/** Shows a "draft, not yet reviewed" banner on the privacy and terms pages. */
export const LEGAL_DRAFT = false as boolean;

export type LegalMessages = typeof legalEn;
export type LegalDocument = LegalMessages["privacy"];
/** A paragraph, or a bullet list. */
export type LegalBlock = LegalDocument["sections"][number]["body"][number];

/**
 * The privacy policy and terms, kept out of the main message files so their
 * text is only loaded by these two pages.
 */
export async function loadLegal(locale: Locale): Promise<LegalMessages> {
  const loaded = (await import(`../../messages/legal/${locale}.json`)) as {
    default: LegalMessages;
  };
  return loaded.default;
}
