import { pino } from "pino";

/**
 * JSON logs on stdout (Vercel shows them in the function logs). No transport:
 * worker threads don't fit serverless functions. Never log email addresses,
 * tokens or links.
 */
export const logger = pino({
  name: "auth",
  level: process.env.LOG_LEVEL ?? "info",
});

export type { Logger } from "pino";
