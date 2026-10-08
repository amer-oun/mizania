import { describe, expect, it } from "vitest";

import { parseAuthEnv } from "./env";

const valid = {
  BETTER_AUTH_SECRET: "a".repeat(32),
  BETTER_AUTH_URL: "http://localhost:3000",
  SMTP_HOST: "localhost",
  SMTP_PORT: "1025",
  SMTP_USER: "",
  SMTP_PASSWORD: "",
  EMAIL_FROM: "Mizania <you@example.com>",
};

describe("parseAuthEnv", () => {
  it("reads a local .env: port as a number, empty SMTP login as unset", () => {
    expect(parseAuthEnv(valid)).toEqual({
      BETTER_AUTH_SECRET: "a".repeat(32),
      BETTER_AUTH_URL: "http://localhost:3000",
      SMTP_HOST: "localhost",
      SMTP_PORT: 1025,
      EMAIL_FROM: "Mizania <you@example.com>",
    });
  });

  it("accepts a Preview environment without BETTER_AUTH_URL", () => {
    const env = parseAuthEnv({
      ...valid,
      BETTER_AUTH_URL: undefined,
      VERCEL_ENV: "preview",
      VERCEL_URL: "mizania-abc123-team.vercel.app",
    });
    expect(env.BETTER_AUTH_URL).toBeUndefined();
    expect(env.VERCEL_URL).toBe("mizania-abc123-team.vercel.app");
  });

  it("lists every problem by variable name, without echoing values", () => {
    const run = () =>
      parseAuthEnv({
        ...valid,
        BETTER_AUTH_SECRET: "short-secret-value",
        BETTER_AUTH_URL: "not a url",
        SMTP_PORT: "abc",
        EMAIL_FROM: undefined,
      });
    expect(run).toThrow(/BETTER_AUTH_SECRET/);
    expect(run).toThrow(/BETTER_AUTH_URL/);
    expect(run).toThrow(/SMTP_PORT/);
    expect(run).toThrow(/EMAIL_FROM/);
    expect(run).not.toThrow(/short-secret-value/);
  });
});
