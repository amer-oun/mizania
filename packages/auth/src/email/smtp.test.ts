import { describe, expect, it } from "vitest";

import { smtpTransportOptions } from "./smtp";

describe("smtpTransportOptions", () => {
  it("Mailpit: plain connection, no login", () => {
    const options = smtpTransportOptions({ SMTP_HOST: "localhost", SMTP_PORT: 1025 });
    expect(options).toMatchObject({ host: "localhost", port: 1025, secure: false });
    expect(options.auth).toBeUndefined();
  });

  it("Gmail on 465: TLS from the start, with the app password", () => {
    const options = smtpTransportOptions({
      SMTP_HOST: "smtp.gmail.com",
      SMTP_PORT: 465,
      SMTP_USER: "user@gmail.com",
      SMTP_PASSWORD: "app-password",
    });
    expect(options).toMatchObject({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user: "user@gmail.com", pass: "app-password" },
    });
  });
});
