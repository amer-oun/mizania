import type { ReactNode } from "react";

import { requireSession } from "@/lib/session";

// Every page in this group needs a signed-in user. The proxy already sent
// visitors without a session cookie to sign-in; this checks the session itself.
export default async function SignedInLayout({ children }: { children: ReactNode }) {
  await requireSession();
  return children;
}
