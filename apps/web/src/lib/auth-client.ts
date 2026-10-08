import type { Auth } from "@mizania/auth";
import { inferAdditionalFields } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

// No baseURL: requests go to /api/auth on the current origin, so the same
// build works on localhost, previews and production.
export const authClient = createAuthClient({
  plugins: [inferAdditionalFields<Auth>()],
});
