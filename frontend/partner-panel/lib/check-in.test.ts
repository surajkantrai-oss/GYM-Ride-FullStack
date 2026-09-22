import { ApiError } from "@gymride/api-client";
import { describe, expect, it } from "vitest";
import { checkInErrorMessage, checkInViewState } from "./check-in";

const error = (code: string, status = 409) =>
  new ApiError("Backend message", status, "request", { error: { code } });

describe("partner check-in feedback states", () => {
  it.each([
    ["INVALID_CHECK_IN_TOKEN", "invalid"],
    ["CHECK_IN_TOKEN_EXPIRED", "expired"],
    ["CHECK_IN_TOKEN_ALREADY_USED", "already been used"],
    ["CHECK_IN_ALREADY_COMPLETED", "already been checked in"],
    ["BRANCH_CHECK_IN_FORBIDDEN", "not authorized"],
    ["CHECK_IN_TOO_EARLY", "not opened"],
    ["CHECK_IN_WINDOW_CLOSED", "closed"],
    ["INVALID_CHECK_IN_OTP", "fallback OTP is invalid"],
    ["CHECK_IN_OTP_EXPIRED", "fallback OTP expired"],
    ["BOOKING_NOT_ELIGIBLE_FOR_CHECK_IN", "not eligible"],
  ])("maps %s to actionable safe feedback", (code, copy) => {
    expect(checkInErrorMessage(error(code))).toContain(copy);
  });

  it("reports network failure without exposing internals", () => {
    expect(checkInErrorMessage(new ApiError("socket trace", 0))).toContain(
      "Network unavailable",
    );
  });
  it("models ready, loading, error and success UI states deterministically", () => {
    expect(checkInViewState(false, null, false)).toBe("ready");
    expect(checkInViewState(true, null, false)).toBe("verifying");
    expect(
      checkInViewState(false, error("INVALID_CHECK_IN_TOKEN"), false),
    ).toBe("error");
    expect(checkInViewState(false, null, true)).toBe("success");
  });
});
