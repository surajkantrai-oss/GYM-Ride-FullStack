import { describe, expect, it } from "vitest";
import { hasAllowedRole } from "./index";

describe("role authorization", () => {
  it("allows only an explicitly accepted console role", () => {
    expect(
      hasAllowedRole(["CUSTOMER", "ADMIN"], ["ADMIN", "SUPER_ADMIN"]),
    ).toBe(true);
    expect(hasAllowedRole(["CUSTOMER"], ["ADMIN", "SUPER_ADMIN"])).toBe(false);
    expect(hasAllowedRole(["GYM_MANAGER"], ["GYM_OWNER", "GYM_MANAGER"])).toBe(
      true,
    );
  });
});
