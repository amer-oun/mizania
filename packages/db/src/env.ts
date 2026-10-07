import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Load the repo-root .env for local scripts. Variables already set in the
// environment (CI, production) win: process.loadEnvFile does not override them.
const envFile = fileURLToPath(new URL("../../../.env", import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);

export function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set. Copy .env.example to .env at the repo root.");
  }
  return url;
}
