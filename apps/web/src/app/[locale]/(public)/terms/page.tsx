import type { Metadata } from "next";
import { getLocale } from "next-intl/server";

import { LegalDocumentView } from "@/components/legal/legal-document";
import { loadLegal } from "@/lib/legal";

export async function generateMetadata(): Promise<Metadata> {
  const legal = await loadLegal(await getLocale());
  return { title: `${legal.terms.title} · Mizania` };
}

export default async function TermsPage() {
  const legal = await loadLegal(await getLocale());
  return (
    <LegalDocumentView
      document={legal.terms}
      draftNotice={legal.draft}
      contactMissing={legal.contactMissing}
    />
  );
}
