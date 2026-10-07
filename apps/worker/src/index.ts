import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { Redis } from "ioredis";
import { pino } from "pino";

const envFile = fileURLToPath(new URL("../../../.env", import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);

const isDev = process.env.NODE_ENV !== "production";
const log = pino({
  level: process.env.LOG_LEVEL ?? "info",
  ...(isDev && { transport: { target: "pino-pretty" } }),
});

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";

// BullMQ requires maxRetriesPerRequest: null on its connections; set it now
// so this connection can be handed to queues and workers later.
const redis = new Redis(redisUrl, { maxRetriesPerRequest: null });

redis.on("ready", () => {
  log.info("worker ready");
});
redis.on("error", (err) => {
  log.error({ err }, "redis error");
});

const shutdown = async (signal: string) => {
  log.info({ signal }, "shutting down");
  await redis.quit();
  process.exit(0);
};
process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
