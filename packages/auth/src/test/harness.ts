import { createTestDatabase, type TestDatabase } from "@mizania/db/testing";

import {
  type AuthEmailKind,
  type AuthEmailRecipient,
  createAuth,
  type CreateAuthOptions,
} from "../auth";

export const BASE_URL = "http://localhost:3000";

export interface SentEmail {
  kind: AuthEmailKind;
  to: AuthEmailRecipient;
  url: string;
}

export interface TestAuth {
  auth: ReturnType<typeof createAuth>;
  test: TestDatabase;
  /** Every email the auth instance asked to send, in order. */
  emails: SentEmail[];
  lastEmail: (kind: AuthEmailKind, email: string) => SentEmail;
  request: (path: string, init?: RequestOptions) => Promise<Response>;
  post: (path: string, body: unknown, init?: RequestOptions) => Promise<Response>;
}

export interface RequestOptions {
  method?: string;
  body?: unknown;
  cookie?: string;
  /** Client IP (x-forwarded-for). Rate limits are counted per IP. */
  ip?: string;
  origin?: string;
}

/**
 * A Better Auth instance on a fresh migrated database, with a mailer that
 * records emails instead of sending them. Requests go straight to the handler.
 */
export async function createTestAuth(
  options: Partial<Omit<CreateAuthOptions, "db">> = {},
): Promise<TestAuth> {
  const test = await createTestDatabase();
  const emails: SentEmail[] = [];

  const auth = createAuth({
    db: test.db,
    env: {
      BETTER_AUTH_SECRET: "test-secret-that-is-at-least-32-characters",
      BETTER_AUTH_URL: BASE_URL,
    },
    mailer: {
      send(kind, to, url) {
        emails.push({ kind, to, url });
        return Promise.resolve();
      },
    },
    ...options,
  });

  const request = (path: string, init: RequestOptions = {}) => {
    const headers = new Headers({
      origin: init.origin ?? BASE_URL,
      "x-forwarded-for": init.ip ?? "203.0.113.1",
    });
    if (init.cookie) headers.set("cookie", init.cookie);
    if (init.body !== undefined) headers.set("content-type", "application/json");
    const url = path.startsWith("http") ? path : `${BASE_URL}/api/auth${path}`;
    return auth.handler(
      new Request(url, {
        method: init.method ?? (init.body === undefined ? "GET" : "POST"),
        headers,
        ...(init.body !== undefined && { body: JSON.stringify(init.body) }),
      }),
    );
  };

  return {
    auth,
    test,
    emails,
    lastEmail(kind, email) {
      const found = emails.findLast((e) => e.kind === kind && e.to.email === email);
      if (!found) throw new Error(`No ${kind} email to ${email}`);
      return found;
    },
    request,
    post: (path, body, init = {}) => request(path, { ...init, body }),
  };
}

/** The session cookie from a response, as a `cookie` request header. */
export function sessionCookie(response: Response): string | undefined {
  const cookie = response.headers
    .getSetCookie()
    .find((c) => c.startsWith("better-auth.session_token="));
  return cookie?.split(";")[0];
}
