/// <reference lib="webworker" />
import { defaultCache } from "@serwist/next/worker";
import { type PrecacheEntry, Serwist, type SerwistGlobalConfig } from "serwist";

// Compiled by `serwist build` (see serwist.config.js) into public/sw.js.
// Phase 0: precache the build output and use Serwist's default runtime
// caching. Offline data (Dexie) and sync arrive in Phase 4.

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    // Injected at build time.
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  // Spread because Serwist's precacheEntries type rejects undefined under exactOptionalPropertyTypes.
  ...(self.__SW_MANIFEST && { precacheEntries: self.__SW_MANIFEST }),
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
});

serwist.addEventListeners();
