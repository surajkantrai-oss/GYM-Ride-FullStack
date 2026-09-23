import { describe, expect, it, vi } from "vitest";
import { customerApi } from "./customer";
import { MobileApiClient } from "./client";
function fixture() {
  const client = new MobileApiClient(
    "https://example.test/api/v1",
    { read: async () => null, write: async () => {}, clear: async () => {} },
    () => "uuid",
    () => {},
  );
  const request = vi.spyOn(client, "request").mockResolvedValue({});
  return { api: customerApi(client), request };
}
describe("customer API contract", () => {
  it("requests and verifies OTP using unauthenticated endpoints", async () => {
    const { api, request } = fixture();
    await api.requestOtp("+919876543212");
    await api.verifyOtp("+919876543212", "123456");
    expect(request.mock.calls.map(([path]) => path)).toEqual([
      "/auth/otp/request",
      "/auth/otp/verify",
    ]);
    expect(request.mock.calls.every((call) => call[2] === false)).toBe(true);
  });
  it("sends only reservation identifiers and caller-held idempotency key", async () => {
    const { api, request } = fixture();
    await api.reserve(
      { branchId: "branch", planId: "plan", slotId: "slot" },
      "same-key",
    );
    expect(request).toHaveBeenCalledWith("/bookings", {
      method: "POST",
      body: JSON.stringify({
        branchId: "branch",
        planId: "plan",
        slotId: "slot",
      }),
      headers: { "Idempotency-Key": "same-key" },
    });
  });
  it("queries server plan and slot availability instead of deriving capacity", async () => {
    const { api, request } = fixture();
    await api.plans("branch");
    await api.slots("branch", "2026-09-16", "plan");
    expect(request.mock.calls[0][0]).toBe("/branches/branch/plans");
    expect(request.mock.calls[1][0]).toContain("date=2026-09-16&planId=plan");
  });
  it("uses server payment order and verification routes", async () => {
    const { api, request } = fixture();
    await api.order("booking");
    await api.verifyPayment("payment", {
      orderId: "order",
      paymentId: "provider-id",
      signature: "proof",
    });
    expect(request.mock.calls[0][0]).toBe("/bookings/booking/payment");
    expect(request.mock.calls[1][0]).toBe("/payments/payment/verify");
  });
  it("retrieves paginated bookings and owned detail", async () => {
    const { api, request } = fixture();
    await api.bookings(2);
    await api.booking("booking");
    expect(request.mock.calls.map(([path]) => path)).toEqual([
      "/bookings?page=2&limit=20",
      "/bookings/booking",
    ]);
  });
  it("uses authenticated short-lived check-in credential endpoints", async () => {
    const { api, request } = fixture();
    await api.checkInStatus("booking");
    await api.checkInQr("booking");
    await api.checkInOtp("booking");
    expect(request.mock.calls.map(([path]) => path)).toEqual([
      "/bookings/booking/check-in",
      "/bookings/booking/check-in/qr",
      "/bookings/booking/check-in/otp",
    ]);
    expect(request.mock.calls[1][1]?.method).toBe("POST");
    expect(request.mock.calls[2][1]?.method).toBe("POST");
  });
  it("uses existing profile and cancellation endpoints", async () => {
    const { api, request } = fixture();
    await api.updateProfile({ firstName: "Customer" });
    await api.cancel("booking");
    expect(request.mock.calls[0][0]).toBe("/users/me");
    expect(request.mock.calls[0][1]?.method).toBe("PATCH");
    expect(request.mock.calls[1][0]).toBe("/bookings/booking/cancel");
  });
  it("uses server-authoritative Flex purchase and booking endpoints", async () => {
    const { api, request } = fixture();
    await api.purchaseFlex({ planId: "flex-plan", primaryCityId: "city-a", secondaryCityId: "city-b" }, "purchase-key");
    await api.flexBooking({ branchId: "branch", planId: "gym-plan", slotId: "slot" }, "booking-key");
    expect(request.mock.calls[0]).toEqual(["/flex/subscriptions", { method: "POST", body: JSON.stringify({ planId: "flex-plan", primaryCityId: "city-a", secondaryCityId: "city-b" }), headers: { "Idempotency-Key": "purchase-key" } }]);
    expect(request.mock.calls[1]).toEqual(["/flex/bookings", { method: "POST", body: JSON.stringify({ branchId: "branch", planId: "gym-plan", slotId: "slot" }), headers: { "Idempotency-Key": "booking-key" } }]);
  });
  it("loads Flex plans, cities, entitlement and server-filtered gyms", async () => {
    const { api, request } = fixture();
    await api.flexPlans(); await api.flexCities(); await api.flexSubscription(); await api.flexGyms("city");
    expect(request.mock.calls.map(([path]) => path)).toEqual(["/flex/plans", "/flex/cities", "/flex/subscription", "/flex/gyms?cityId=city"]);
  });
  it("uses authenticated recommendation and owned-preference endpoints", async () => {
    const { api, request } = fixture();
    await api.recommendations("city=Pune&limit=5"); await api.gymPreferences(); await api.updateGymPreferences({ preferredRadiusKm: 5 });
    expect(request.mock.calls.map(([path]) => path)).toEqual(["/recommendations/gyms?city=Pune&limit=5", "/users/me/gym-preferences", "/users/me/gym-preferences"]);
    expect(request.mock.calls[2][1]?.method).toBe("PATCH");
  });
});
