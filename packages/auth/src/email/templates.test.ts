import { userLocales } from "@mizania/db/schema";
import { describe, expect, it } from "vitest";

import type { AuthEmailKind } from "../auth";
import { emailMessages } from "./messages";
import { renderAuthEmail } from "./templates";

const url =
  "http://localhost:3000/api/auth/verify-email?token=abc.def.ghi&callbackURL=%2Far%2Fverify-email";
const kinds: AuthEmailKind[] = ["verify-email", "reset-password"];

describe("renderAuthEmail", () => {
  for (const locale of userLocales) {
    for (const kind of kinds) {
      it(`${kind} in ${locale}: subject, greeting and link in text and HTML`, () => {
        const email = renderAuthEmail(kind, locale, { name: "Amel", url });
        const strings = emailMessages[locale].emails[kind];

        expect(email.subject).toBe(strings.subject);
        expect(email.text).toContain(strings.greeting.replace("{name}", "Amel"));
        expect(email.text).toContain(url);
        expect(email.html).toContain(`lang="${locale}"`);
        expect(email.html).toContain(`href="${url.replaceAll("&", "&amp;")}"`);
        expect(email.html).toContain(strings.button);
      });
    }
  }

  it("writes Arabic right to left and the others left to right", () => {
    expect(renderAuthEmail("verify-email", "ar", { name: "أمل", url }).html).toContain('dir="rtl"');
    expect(renderAuthEmail("verify-email", "fr", { name: "Amel", url }).html).toContain(
      'dir="ltr"',
    );
  });

  it("states how long each link works", () => {
    expect(renderAuthEmail("verify-email", "en", { name: "A", url }).text).toContain("24 hours");
    expect(renderAuthEmail("reset-password", "en", { name: "A", url }).text).toContain("1 hour");
    expect(renderAuthEmail("verify-email", "ar", { name: "A", url }).text).toContain("24 ساعة");
    expect(renderAuthEmail("reset-password", "fr", { name: "A", url }).text).toContain("1 heure");
  });

  it("escapes HTML in the user's name", () => {
    const { html } = renderAuthEmail("verify-email", "en", {
      name: '<a href="https://evil.example">x</a>',
      url,
    });
    expect(html).not.toContain('evil.example"');
    expect(html).toContain("&lt;a href=&quot;https://evil.example&quot;&gt;");
  });
});
