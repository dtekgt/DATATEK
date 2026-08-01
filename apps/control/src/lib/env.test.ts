import { describe, it } from "node:test";
import { expect } from "expect";
import { getControlEnv } from "./env";

describe("getControlEnv", () => {
  it("resolves safe localhost defaults when env vars are unset", () => {
    const env = getControlEnv();
    expect(env.NEXT_PUBLIC_CONTROL_APP_ENV).toBe("local");
    expect(env.NEXT_PUBLIC_CONTROL_SITE_URL).toContain("localhost");
  });
});
