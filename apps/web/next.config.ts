import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Internal workspace packages ship TypeScript source (exports -> src/*.ts),
  // so Next must compile them. Add each @mizania/* package the app imports.
  transpilePackages: ["@mizania/core"],
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
