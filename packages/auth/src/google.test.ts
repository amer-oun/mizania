import { describe, expect, it } from "vitest";

import { googleCredentials, isGoogleEnabled } from "./google";

const credentials = { GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "secret" };

describe("googleCredentials", () => {
  it("turns Google on locally and in production (fixed base URL)", () => {
    expect(googleCredentials({ ...credentials, BETTER_AUTH_URL: "http://localhost:3000" })).toEqual(
      { clientId: "id", clientSecret: "secret" },
    );
    expect(
      isGoogleEnabled({ ...credentials, BETTER_AUTH_URL: "https://mizania-roan.vercel.app" }),
    ).toBe(true);
  });

  it("keeps Google off on previews (no BETTER_AUTH_URL), even with credentials", () => {
    expect(isGoogleEnabled(credentials)).toBe(false);
  });

  it("keeps Google off without both credentials", () => {
    const url = { BETTER_AUTH_URL: "http://localhost:3000" };
    expect(isGoogleEnabled(url)).toBe(false);
    expect(isGoogleEnabled({ ...url, GOOGLE_CLIENT_ID: "id" })).toBe(false);
    expect(isGoogleEnabled({ ...url, GOOGLE_CLIENT_SECRET: "secret" })).toBe(false);
  });
});
