import { describe, expect, it } from "vitest";

import { APP_TIME_ZONE, MILLIMES_PER_DINAR } from "./index";

describe("core constants", () => {
  it("uses 1000 millimes per dinar", () => {
    expect(MILLIMES_PER_DINAR).toBe(1000);
    expect(Number.isSafeInteger(MILLIMES_PER_DINAR)).toBe(true);
  });

  it("uses a time zone the runtime recognises", () => {
    const resolved = new Intl.DateTimeFormat("en", { timeZone: APP_TIME_ZONE }).resolvedOptions();
    expect(resolved.timeZone).toBe("Africa/Tunis");
  });
});
