import { Writable } from "node:stream";

import { pino } from "pino";
import { describe, expect, it } from "vitest";

import type { AuthEmailRecipient } from "../auth";
import { createMailer, redact } from "./mailer";
import type { EmailMessage } from "./smtp";

const to: AuthEmailRecipient = {
  id: "8f0e7a52-5b8a-4c1e-9d2f-3a6b7c8d9e0f",
  name: "Amel",
  email: "amel@example.com",
  locale: "fr",
};
const token = "eyJhbGciOiJIUzI1NiJ9.eyJlbWFpbCI6ImFtZWxAZXhhbXBsZS5jb20ifQ.c2lnbmF0dXJlLXZhbHVl";
const url = `https://mizania-roan.vercel.app/api/auth/verify-email?token=${token}&callbackURL=%2Ffr`;

function captureLogs() {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, done) {
      lines.push(chunk.toString());
      done();
    },
  });
  return { logger: pino(stream), lines };
}

describe("createMailer", () => {
  it("sends the email in the user's language to their address", async () => {
    const sent: EmailMessage[] = [];
    const { logger, lines } = captureLogs();
    const mailer = createMailer({
      sendEmail: (m) => {
        sent.push(m);
        return Promise.resolve();
      },
      logger,
    });

    await mailer.send("verify-email", to, url);

    expect(sent).toHaveLength(1);
    expect(sent[0]?.to).toBe("amel@example.com");
    expect(sent[0]?.subject).toBe("Confirme ton email pour Mizania");
    expect(sent[0]?.text).toContain(url);
    expect(lines.join("")).toContain('"msg":"auth email sent"');
  });

  it("logs a failure without the address, link or token, and doesn't throw", async () => {
    const { logger, lines } = captureLogs();
    const failure = Object.assign(
      new Error(
        `Can't send mail - all recipients were rejected: 550 5.1.1 <amel@example.com> ${url}`,
      ),
      { code: "EENVELOPE", responseCode: 550, command: "RCPT TO:<amel@example.com>" },
    );
    const mailer = createMailer({ sendEmail: () => Promise.reject(failure), logger });

    await expect(mailer.send("reset-password", to, url)).resolves.toBeUndefined();

    const log = lines.join("");
    const entry = JSON.parse(lines[0] ?? "{}") as Record<string, unknown>;
    expect(entry).toMatchObject({
      level: 50,
      msg: "auth email failed",
      event: "auth_email",
      kind: "reset-password",
      userId: to.id,
      err: { code: "EENVELOPE", responseCode: 550, command: "RCPT" },
    });
    expect(log).not.toContain("amel@example.com");
    expect(log).not.toContain(token);
    expect(log).not.toContain("mizania-roan.vercel.app");
  });
});

describe("redact", () => {
  it("removes addresses, links and tokens but keeps the rest", () => {
    expect(redact(`550 <a.b@x.tn> rejected ${token} at https://x.tn/a?b=c`)).toBe(
      "550 <[email]> rejected [token] at [url]",
    );
    expect(redact("Connection timeout")).toBe("Connection timeout");
  });
});
