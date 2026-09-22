import type { NotificationRoute } from "@gymride/types";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Never treat provider-supplied data as an arbitrary URL or screen name. */
export function safeNotificationRoute(value: unknown): NotificationRoute | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  if (["Booking", "CheckIn", "BookingReview"].includes(String(data.screen)) && typeof data.bookingId === "string" && uuid.test(data.bookingId))
    return { screen: data.screen as "Booking" | "CheckIn" | "BookingReview", bookingId: data.bookingId };
  if (data.screen === "Gym" && typeof data.gymId === "string" && uuid.test(data.gymId))
    return { screen: "Gym", gymId: data.gymId };
  return null;
}
