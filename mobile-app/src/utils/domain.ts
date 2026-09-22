import type { BookingStatus } from "@gymride/types";
import { MobileApiError } from "../api/client";
export const validPhone = (value: string) => /^\+[1-9]\d{7,14}$/.test(value);
export const validOtp = (value: string) => /^\d{6}$/.test(value);
export function money(amount: number, currency: string) {
  if (!Number.isSafeInteger(amount)) return "Price unavailable";
  return new Intl.NumberFormat("en-IN", { style: "currency", currency }).format(
    amount / 100,
  );
}
export function slotTime(timestamp: string, timezone: string) {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: timezone,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestamp));
}
export function remainingSeconds(
  deadline: string | null | undefined,
  now = Date.now(),
) {
  return deadline
    ? Math.max(0, Math.ceil((Date.parse(deadline) - now) / 1000))
    : 0;
}
export function bookingGroup(status: BookingStatus) {
  return [
    "PAYMENT_PENDING",
    "CONFIRMED",
    "CHECK_IN_AVAILABLE",
    "CHECKED_IN",
  ].includes(status)
    ? "Upcoming"
    : ["COMPLETED", "NO_SHOW"].includes(status)
      ? "Past"
      : "Other";
}
export function errorMessage(error: unknown) {
  const code = error instanceof MobileApiError ? error.code : "";
  const messages: Record<string, string> = {
    CONFIGURATION_REQUIRED: "Set the mobile API URL before connecting.",
    NETWORK_UNAVAILABLE: "You appear to be offline. Reconnect and try again.",
    TIMEOUT: "The request timed out. Check its status before retrying.",
    INVALID_OTP: "That code is not valid. Please try again.",
    OTP_EXPIRED: "Your code expired. Request a new code.",
    OTP_ATTEMPTS_EXCEEDED: "Too many attempts. Request a new code.",
    OTP_RATE_LIMITED: "Please wait before requesting another code.",
    SESSION_EXPIRED: "Your session expired. Please sign in again.",
    SLOT_FULL: "This slot just filled up. Choose another slot.",
    RESERVATION_EXPIRED: "Your reservation has expired. Refresh the booking.",
    IDEMPOTENCY_KEY_CONFLICT:
      "This request changed. Review the booking before trying again.",
    INVALID_PAYMENT_SIGNATURE:
      "Payment could not be verified. Refresh the booking status.",
    PAYMENT_ORDER_CREATION_FAILED:
      "Payment preparation is pending. Refresh before retrying.",
    CHECK_IN_TOO_EARLY:
      "Check-in is not open yet. Refresh near your booked slot.",
    CHECK_IN_WINDOW_CLOSED: "The check-in window has closed.",
    INVALID_CHECK_IN_TOKEN:
      "That QR credential is not valid. Generate a new one.",
    CHECK_IN_TOKEN_EXPIRED: "Your QR expired. Generate a new secure QR.",
    CHECK_IN_TOKEN_ALREADY_USED: "That QR has already been used.",
    CHECK_IN_ALREADY_COMPLETED: "This booking has already been checked in.",
    INVALID_CHECK_IN_OTP: "That check-in code is not valid.",
    CHECK_IN_OTP_EXPIRED: "Your check-in code expired. Request another.",
    CHECK_IN_OTP_ATTEMPTS_EXCEEDED:
      "Too many code attempts. Request a new check-in code.",
    CHECK_IN_OTP_RATE_LIMITED:
      "Please wait before requesting another check-in code.",
    BOOKING_NOT_ELIGIBLE_FOR_CHECK_IN:
      "This booking is not currently eligible for check-in.",
  };
  if (messages[code]) return messages[code];
  if (error instanceof MobileApiError) {
    if (error.status === 429)
      return "Too many requests. Please wait and try again.";
    if (error.status === 404) return "This item is no longer available.";
    if (error.status === 403)
      return "This action is not available for your account.";
    if (error.status === 409 || error.status === 422)
      return "Availability or status changed. Refresh and try again.";
    if (error.status === 400) return "Check the entered details and try again.";
  }
  return "Something went wrong. Please try again.";
}
