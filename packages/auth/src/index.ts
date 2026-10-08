export {
  type Auth,
  type AuthEmailKind,
  type AuthEmailRecipient,
  type AuthMailer,
  createAuth,
  type CreateAuthOptions,
  RESET_LINK_EXPIRES_IN,
  SESSION_EXPIRES_IN,
  VERIFICATION_LINK_EXPIRES_IN,
} from "./auth";
export { resolveBaseURL } from "./base-url";
export { createMailer } from "./email/mailer";
export { createSmtpSender, type EmailMessage, type SendEmail } from "./email/smtp";
export { renderAuthEmail } from "./email/templates";
export { type AuthEnv, parseAuthEnv } from "./env";
export { type Logger, logger } from "./logger";
