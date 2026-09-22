import { describe, expect, it } from "vitest";
import { checkInAudit } from "./check-in-visibility";

describe("admin check-in visibility", () => {
  it("exposes read-only operational audit fields without QR or OTP secrets", () => {
    const result = checkInAudit({
      id: "check-in",
      status: "VERIFIED",
      method: "QR",
      verifiedAt: "2026-09-17T10:00:00Z",
      verifiedBy: { id: "staff", firstName: "Staff", lastName: null },
    });
    expect(result).toEqual({
      status: "VERIFIED",
      method: "QR",
      verifiedAt: "2026-09-17T10:00:00Z",
      verifiedByUserId: "staff",
    });
    expect(result).not.toHaveProperty("token");
    expect(result).not.toHaveProperty("otp");
  });
});
