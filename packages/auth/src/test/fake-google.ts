import { createSign, generateKeyPairSync, randomUUID } from "node:crypto";

import { vi } from "vitest";

export const GOOGLE_CLIENT_ID = "test-client.apps.googleusercontent.com";
export const GOOGLE_CLIENT_SECRET = "test-client-secret";

export interface GoogleProfile {
  sub: string;
  email: string;
  email_verified: boolean;
  name: string;
  picture?: string;
}

const base64url = (value: string | Buffer) => Buffer.from(value).toString("base64url");

/**
 * Stands in for Google's token endpoint and signing keys. In the
 * authorization-code flow Better Auth reads the ID token it got straight from
 * Google's token endpoint over TLS without checking its signature (allowed by
 * OpenID Connect Core 3.1.3.7). Tokens are still properly signed and the keys
 * served, so the fake keeps working if that ever changes.
 */
export function fakeGoogle() {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const kid = randomUUID();
  const jwk = { ...publicKey.export({ format: "jwk" }), kid, alg: "RS256", use: "sig" };

  let next: { profile: GoogleProfile; nonce: string } | undefined;

  function idToken(profile: GoogleProfile, nonce: string) {
    const now = Math.floor(Date.now() / 1000);
    const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT", kid }));
    const payload = base64url(
      JSON.stringify({
        iss: "https://accounts.google.com",
        aud: GOOGLE_CLIENT_ID,
        iat: now,
        exp: now + 3600,
        nonce,
        ...profile,
      }),
    );
    const signature = createSign("RSA-SHA256").update(`${header}.${payload}`).sign(privateKey);
    return `${header}.${payload}.${base64url(signature)}`;
  }

  const realFetch = globalThis.fetch;
  const spy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = input instanceof Request ? input.url : input.toString();
    if (url.startsWith("https://www.googleapis.com/oauth2/v3/certs")) {
      return Response.json({ keys: [jwk] });
    }
    if (url.startsWith("https://oauth2.googleapis.com/token")) {
      if (!next) return Response.json({ error: "invalid_grant" }, { status: 400 });
      const { profile, nonce } = next;
      next = undefined;
      return Response.json({
        access_token: "fake-access-token",
        id_token: idToken(profile, nonce),
        expires_in: 3600,
        token_type: "Bearer",
        scope: "openid email profile",
      });
    }
    return realFetch(input, init);
  });

  return {
    /** The profile Google returns for the next code exchange. */
    willReturn(profile: GoogleProfile, nonce: string) {
      next = { profile, nonce };
    },
    restore: () => {
      spy.mockRestore();
    },
  };
}
