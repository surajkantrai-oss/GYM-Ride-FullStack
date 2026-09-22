import { ApiError } from "@gymride/api-client";

export function checkInErrorCode(error: unknown): string {
  if (
    !(error instanceof ApiError) ||
    !error.details ||
    typeof error.details !== "object"
  )
    return "";
  const nested = (error.details as { error?: { code?: unknown } }).error;
  return typeof nested?.code === "string" ? nested.code : "";
}

export function checkInErrorMessage(error: unknown): string {
  const messages: Record<string, string> = {
    INVALID_CHECK_IN_TOKEN:
      "The QR token is invalid. Ask the customer to regenerate it.",
    CHECK_IN_TOKEN_EXPIRED:
      "The QR token expired. Ask the customer to generate a new QR.",
    CHECK_IN_TOKEN_ALREADY_USED: "This QR token has already been used.",
    CHECK_IN_ALREADY_COMPLETED: "This booking has already been checked in.",
    BRANCH_CHECK_IN_FORBIDDEN:
      "You are not authorized to verify check-ins for this branch.",
    CHECK_IN_TOO_EARLY: "The booking check-in window has not opened.",
    CHECK_IN_WINDOW_CLOSED: "The booking check-in window has closed.",
    INVALID_CHECK_IN_OTP: "The booking reference or fallback OTP is invalid.",
    CHECK_IN_OTP_EXPIRED:
      "The fallback OTP expired. Ask the customer for a new code.",
    CHECK_IN_OTP_ATTEMPTS_EXCEEDED:
      "The fallback OTP attempt limit was reached.",
    BOOKING_NOT_ELIGIBLE_FOR_CHECK_IN:
      "This booking is not eligible for check-in.",
  };
  const code = checkInErrorCode(error);
  if (messages[code]) return messages[code];
  if (error instanceof ApiError && error.status === 0)
    return "Network unavailable. Reconnect before retrying.";
  return error instanceof Error
    ? error.message
    : "Verification failed. Refresh and try again.";
}

export function checkInViewState(
  pending: boolean,
  error: unknown,
  succeeded: boolean,
): "ready" | "verifying" | "error" | "success" {
  if (pending) return "verifying";
  if (error) return "error";
  if (succeeded) return "success";
  return "ready";
}
