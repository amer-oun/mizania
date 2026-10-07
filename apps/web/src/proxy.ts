import createMiddleware from "next-intl/middleware";

import { routing } from "./i18n/routing";

export default createMiddleware(routing);

export const config = {
  // Everything except API routes, Next internals, the service worker and
  // files with an extension (icons, manifest, ...).
  matcher: ["/((?!api|_next|_vercel|sw\\.js|swe-worker|.*\\..*).*)"],
};
