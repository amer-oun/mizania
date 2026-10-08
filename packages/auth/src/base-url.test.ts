import { describe, expect, it } from "vitest";

import { resolveBaseURL } from "./base-url";

describe("resolveBaseURL", () => {
  it("uses BETTER_AUTH_URL when set (production, local), without a trailing slash", () => {
    expect(resolveBaseURL({ BETTER_AUTH_URL: "https://mizania-roan.vercel.app/" })).toBe(
      "https://mizania-roan.vercel.app",
    );
    expect(resolveBaseURL({ BETTER_AUTH_URL: "http://localhost:3000" })).toBe(
      "http://localhost:3000",
    );
  });

  it("prefers BETTER_AUTH_URL over Vercel's variables", () => {
    expect(
      resolveBaseURL({
        BETTER_AUTH_URL: "https://mizania-roan.vercel.app",
        VERCEL_ENV: "production",
        VERCEL_URL: "mizania-abc123-team.vercel.app",
      }),
    ).toBe("https://mizania-roan.vercel.app");
  });

  it("on Vercel Preview, allows only this deployment's own two hosts, over https", () => {
    expect(
      resolveBaseURL({
        VERCEL_ENV: "preview",
        VERCEL_URL: "mizania-abc123-team.vercel.app",
        VERCEL_BRANCH_URL: "mizania-git-feat-auth-email-team.vercel.app",
      }),
    ).toEqual({
      allowedHosts: [
        "mizania-abc123-team.vercel.app",
        "mizania-git-feat-auth-email-team.vercel.app",
      ],
      protocol: "https",
    });
  });

  it("on Vercel Preview, works with only one of the two hosts", () => {
    expect(
      resolveBaseURL({ VERCEL_ENV: "preview", VERCEL_URL: "mizania-abc123-team.vercel.app" }),
    ).toEqual({ allowedHosts: ["mizania-abc123-team.vercel.app"], protocol: "https" });
  });

  it("fails instead of guessing from the request", () => {
    expect(() => resolveBaseURL({})).toThrow(/BETTER_AUTH_URL is not set/);
    expect(() => resolveBaseURL({ VERCEL_ENV: "preview" })).toThrow(/BETTER_AUTH_URL is not set/);
    expect(() =>
      resolveBaseURL({ VERCEL_ENV: "production", VERCEL_URL: "mizania-abc123-team.vercel.app" }),
    ).toThrow(/BETTER_AUTH_URL is not set/);
  });
});
