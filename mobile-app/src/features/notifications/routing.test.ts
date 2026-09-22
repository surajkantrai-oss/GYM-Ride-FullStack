import { describe, expect, it } from "vitest";
import { safeNotificationRoute } from "./routing";

describe("safe notification routes", () => {
  const bookingId = "b46d3a71-42d9-4f34-b903-131aab4da67d";
  it.each(["Booking", "CheckIn", "BookingReview"] as const)("accepts the %s destination only with a UUID", (screen) => {
    expect(safeNotificationRoute({ screen, bookingId })).toEqual({ screen, bookingId });
  });
  it("accepts gym navigation but not arbitrary URLs or route names", () => {
    expect(safeNotificationRoute({ screen: "Gym", gymId: bookingId })).toEqual({ screen: "Gym", gymId: bookingId });
    expect(safeNotificationRoute({ screen: "https://evil.invalid", bookingId })).toBeNull();
    expect(safeNotificationRoute({ screen: "Booking", bookingId: "../admin" })).toBeNull();
    expect(safeNotificationRoute({ screen: "PartnerSettlement", settlementId: bookingId })).toBeNull();
  });
});
