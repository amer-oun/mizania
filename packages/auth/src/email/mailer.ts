import type { Logger } from "pino";

import type { AuthMailer } from "../auth";
import type { SendEmail } from "./smtp";
import { renderAuthEmail } from "./templates";

const EMAIL = /[^\s<>"'@]+@[^\s<>"'@]+/g;
const URL_LIKE = /\bhttps?:\/\/\S+/g;
// Tokens: dot-separated base64url parts (JWT), or one long base64url run.
const TOKEN_LIKE = /\b[\w-]{8,}(?:\.[\w-]{8,})+|\b[\w-]{24,}/g;

/** Removes email addresses, links and token-like strings from a log message. */
export function redact(value: string): string {
  return value.replace(URL_LIKE, "[url]").replace(EMAIL, "[email]").replace(TOKEN_LIKE, "[token]");
}

/** The parts of an SMTP error that help debugging and contain no personal data. */
export function describeSendError(error: unknown) {
  if (!(error instanceof Error)) return { message: redact(String(error)) };
  const e = error as Error & { code?: unknown; responseCode?: unknown; command?: unknown };
  return {
    name: e.name,
    message: redact(e.message),
    ...(typeof e.code === "string" && { code: e.code }),
    ...(typeof e.responseCode === "number" && { responseCode: e.responseCode }),
    ...(typeof e.command === "string" && { command: e.command.split(" ")[0] }),
  };
}

/**
 * Renders auth emails in the user's language and sends them. Never throws:
 * a failure is logged (user id, email kind, redacted SMTP error; never the
 * address, link or token) so it shows up in Vercel's logs.
 */
export function createMailer({
  sendEmail,
  logger,
}: {
  sendEmail: SendEmail;
  logger: Logger;
}): AuthMailer {
  return {
    async send(kind, to, url) {
      const fields = { event: "auth_email", kind, userId: to.id, locale: to.locale };
      try {
        const email = renderAuthEmail(kind, to.locale, { name: to.name, url });
        await sendEmail({ to: to.email, ...email });
        logger.info(fields, "auth email sent");
      } catch (error) {
        logger.error({ ...fields, err: describeSendError(error) }, "auth email failed");
      }
    },
  };
}
