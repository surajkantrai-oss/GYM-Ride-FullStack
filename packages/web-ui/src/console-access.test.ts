import { describe, expect, it } from "vitest";
import { consoleAccessStatus } from "./index";

describe("console access state", () => {
  const partnerRoles = ["GYM_OWNER", "GYM_MANAGER", "GYM_STAFF"] as const;

  it("preserves existing partner access", () => {
    expect(consoleAccessStatus(["GYM_OWNER"], [...partnerRoles], true)).toBe(
      "authenticated",
    );
  });

  it("routes an authenticated customer without a gym role to onboarding", () => {
    expect(consoleAccessStatus(["CUSTOMER"], [...partnerRoles], true)).toBe(
      "onboarding",
    );
  });

  it("keeps strict consoles forbidden", () => {
    expect(consoleAccessStatus(["CUSTOMER"], [...partnerRoles])).toBe(
      "forbidden",
    );
  });
});
