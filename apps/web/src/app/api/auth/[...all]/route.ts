import { getAuth } from "@/lib/auth";

// Better Auth's endpoints: /api/auth/sign-up/email, /api/auth/verify-email, ...
// Session cookies are set by this app's own domain (ADR 005).
function handler(request: Request) {
  return getAuth().handler(request);
}

export { handler as GET, handler as POST };
