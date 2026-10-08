import { CircleAlertIcon } from "lucide-react";
import { Fragment, type ReactNode } from "react";

import { CONTACT_EMAIL, LEGAL_DRAFT, type LegalBlock, type LegalDocument } from "@/lib/legal";

/** Replaces {contact} with the contact address (a mailto link once it's set). */
function withContact(text: string, missing: string): ReactNode {
  const parts = text.split("{contact}");
  return parts.map((part, i) => (
    <Fragment key={i}>
      {part}
      {i < parts.length - 1 &&
        (CONTACT_EMAIL ? (
          <a href={`mailto:${CONTACT_EMAIL}`} dir="ltr" className="text-primary underline">
            {CONTACT_EMAIL}
          </a>
        ) : (
          <span className="font-medium">{missing}</span>
        ))}
    </Fragment>
  ));
}

function Block({ block, missing }: { block: LegalBlock; missing: string }) {
  if (typeof block === "string") return <p>{withContact(block, missing)}</p>;
  return (
    <ul className="list-disc space-y-1 ps-5">
      {block.map((item, i) => (
        <li key={i}>{withContact(item, missing)}</li>
      ))}
    </ul>
  );
}

export function LegalDocumentView({
  document,
  draftNotice,
  contactMissing,
}: {
  document: LegalDocument;
  draftNotice: string;
  contactMissing: string;
}) {
  return (
    <article className="flex flex-col gap-6 leading-relaxed">
      {LEGAL_DRAFT && (
        <p
          role="note"
          data-testid="legal-draft"
          className="flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive"
        >
          <CircleAlertIcon className="size-4 shrink-0" aria-hidden />
          {draftNotice}
        </p>
      )}
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold">{document.title}</h1>
        <p className="text-muted-foreground">{document.intro}</p>
      </header>
      {document.sections.map((section) => (
        <section key={section.title} className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">{section.title}</h2>
          {section.body.map((block, i) => (
            <Block key={i} block={block} missing={contactMissing} />
          ))}
        </section>
      ))}
    </article>
  );
}
