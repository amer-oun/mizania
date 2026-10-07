// @ts-check
// Used by `serwist build` (runs after `next build`, see package.json). It
// compiles src/app/sw.ts with esbuild and injects the precache manifest:
// Next's static assets, public/ and the prerendered pages (/ar, /fr, /en).
import { serwist } from "@serwist/next/config";

export default serwist({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
});
