import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

// Locally, the variables live in the repo-root .env (shared with the API,
// worker and db scripts). Variables already set (Vercel, CI) win.
const rootEnv = fileURLToPath(new URL("../../.env", import.meta.url));
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Internal workspace packages ship TypeScript source (exports -> src/*.ts),
  // so Next must compile them. Add each @mizania/* package the app imports.
  transpilePackages: ["@mizania/auth", "@mizania/core", "@mizania/db", "@mizania/shared"],
  headers() {
    return Promise.resolve([
      {
        // The service worker must always be revalidated so updates ship.
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
        ],
      },
    ]);
  },
};

export default withNextIntl(nextConfig);
