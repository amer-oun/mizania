import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { buildApp } from "./app";

const envFile = fileURLToPath(new URL("../../../.env", import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);

const host = process.env.API_HOST ?? "0.0.0.0";
const port = Number(process.env.API_PORT ?? 4000);
const isDev = process.env.NODE_ENV !== "production";

const app = buildApp({
  logger: {
    level: process.env.LOG_LEVEL ?? "info",
    ...(isDev && { transport: { target: "pino-pretty" } }),
  },
});

const shutdown = async (signal: string) => {
  app.log.info({ signal }, "shutting down");
  await app.close();
  process.exit(0);
};
process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

try {
  await app.listen({ host, port });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
