import nodemailer from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";

import type { AuthEnv } from "../env";

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export type SendEmail = (message: EmailMessage) => Promise<void>;

type SmtpEnv = Pick<AuthEnv, "SMTP_HOST" | "SMTP_PORT" | "SMTP_USER" | "SMTP_PASSWORD">;

/**
 * Mailpit locally (port 1025, no login); Gmail in production (port 465,
 * TLS from the start, app password).
 */
export function smtpTransportOptions(env: SmtpEnv): SMTPTransport.Options {
  return {
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    ...(env.SMTP_USER && { auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD ?? "" } }),
    // Fail fast inside a serverless function instead of hanging.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  };
}

export function createSmtpSender(env: SmtpEnv & Pick<AuthEnv, "EMAIL_FROM">): SendEmail {
  const transport = nodemailer.createTransport(smtpTransportOptions(env));
  return async (message) => {
    await transport.sendMail({ from: env.EMAIL_FROM, ...message });
  };
}
