import { describe, expect, it } from "vitest";
import {
  bookingGroup,
  money,
  remainingSeconds,
  slotTime,
  validOtp,
  validPhone,
} from "./domain";
import { validateApiUrl } from "../config/environment";
describe("customer domain presentation", () => {
  it.each(["+919876543212", "+14155552671"])("accepts E.164 %s", (phone) =>
    expect(validPhone(phone)).toBe(true),
  );
  it.each(["9876543212", "+012345678", "abc", "+91"])(
    "rejects invalid phone %s",
    (phone) => expect(validPhone(phone)).toBe(false),
  );
  it("requires six OTP digits", () => {
    expect(validOtp("123456")).toBe(true);
    expect(validOtp("12345x")).toBe(false);
  });
  it("formats integer minor units centrally", () =>
    expect(money(49900, "INR")).toBe("₹499.00"));
  it("shows branch local time rather than UTC", () =>
    expect(slotTime("2026-09-15T06:30:00Z", "Asia/Kolkata")).toContain(
      "12:00",
    ));
  it("deadline countdown never invents a booking state", () => {
    expect(
      remainingSeconds(
        "2026-09-15T00:00:10Z",
        Date.parse("2026-09-15T00:00:00Z"),
      ),
    ).toBe(10);
    expect(
      remainingSeconds(
        "2026-09-15T00:00:00Z",
        Date.parse("2026-09-15T00:00:10Z"),
      ),
    ).toBe(0);
  });
  it("groups actual booking statuses without check-in actions", () => {
    expect(bookingGroup("CONFIRMED")).toBe("Upcoming");
    expect(bookingGroup("REFUNDED")).toBe("Other");
    expect(bookingGroup("COMPLETED")).toBe("Past");
  });
  it("requires HTTPS outside development", () => {
    expect(() =>
      validateApiUrl("http://example.test/api/v1", "production"),
    ).toThrow();
    expect(validateApiUrl("http://example.test/api/v1", "development")).toBe(
      "http://example.test/api/v1",
    );
  });
});
