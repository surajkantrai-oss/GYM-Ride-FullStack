import { describe, expect, it, vi } from "vitest";
import {
  ApiClient,
  ApiError,
  createGymRideApi,
  type TokenStore,
} from "./index";

const response = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const store = (): TokenStore & { token: string | null } => ({
  token: null,
  readRefreshToken() {
    return this.token;
  },
  writeRefreshToken(token) {
    this.token = token;
  },
  clear() {
    this.token = null;
  },
});

describe("ApiClient", () => {
  it("normalizes backend errors", async () => {
    const client = new ApiClient("https://api.test", {
      tokenStore: store(),
      fetcher: vi.fn(() =>
        Promise.resolve(
          response(422, {
            error: {
              code: "INVALID",
              message: "Name is required",
              details: { field: "name" },
            },
            requestId: "req-1",
          }),
        ),
      ),
    });
    await expect(client.request("/gyms")).rejects.toMatchObject({
      name: "ApiError",
      status: 422,
      message: "Name is required",
      requestId: "req-1",
      details: { field: "name" },
    });
  });

  it("uses a single refresh for simultaneous unauthorized requests", async () => {
    const tokenStore = store();
    tokenStore.token = "refresh-1";
    let protectedCalls = 0;
    let refreshCalls = 0;
    const fetcher = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/auth/refresh")) {
        refreshCalls += 1;
        return Promise.resolve(
          response(200, {
            tokens: {
              accessToken: "new-access",
              refreshToken: "refresh-2",
            },
          }),
        );
      }
      protectedCalls += 1;
      return Promise.resolve(
        protectedCalls <= 2 ? response(401, {}) : response(200, { ok: true }),
      );
    });
    const client = new ApiClient("https://api.test", { tokenStore, fetcher });
    await Promise.all([client.request("/one"), client.request("/two")]);
    expect(refreshCalls).toBe(1);
    expect(tokenStore.token).toBe("refresh-2");
  });

  it("clears the session and reports refresh failure", async () => {
    const tokenStore = store();
    tokenStore.token = "expired";
    const onAuthFailure = vi.fn();
    const client = new ApiClient("https://api.test", {
      tokenStore,
      onAuthFailure,
      fetcher: vi.fn((input: RequestInfo | URL) =>
        Promise.resolve(
          String(input).endsWith("/auth/refresh")
            ? response(401, {})
            : response(401, {}),
        ),
      ),
    });
    await expect(client.request("/protected")).rejects.toBeInstanceOf(ApiError);
    expect(tokenStore.token).toBeNull();
    expect(onAuthFailure).toHaveBeenCalledOnce();
  });

  it("maps typed Phase 4 methods to role-specific endpoints", async () => {
    const fetcher = vi.fn((_input: RequestInfo | URL) =>
      Promise.resolve(response(200, [])),
    );
    const client = new ApiClient("https://api.test", {
      tokenStore: store(),
      fetcher,
    });
    const domain = createGymRideApi(client);
    await domain.plans.list("gym-1");
    await domain.bookings.admin("?status=EXPIRED");
    expect(fetcher.mock.calls.map(([url]) => String(url))).toEqual([
      "https://api.test/partner/gyms/gym-1/plans",
      "https://api.test/admin/bookings?status=EXPIRED",
    ]);
  });
  it("maps Phase 7 customer and branch-authorized verification endpoints", async () => {
    const fetcher = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) =>
      Promise.resolve(response(200, {})),
    );
    const client = new ApiClient("https://api.test", {
      tokenStore: store(),
      fetcher,
    });
    const domain = createGymRideApi(client);
    await domain.checkIns.status("booking-1");
    await domain.checkIns.qr("booking-1");
    await domain.checkIns.otp("booking-1");
    await domain.checkIns.verifyQr("opaque-token-value");
    await domain.checkIns.verifyOtp("booking-1", "123456");
    expect(fetcher.mock.calls.map(([url]) => String(url))).toEqual([
      "https://api.test/bookings/booking-1/check-in",
      "https://api.test/bookings/booking-1/check-in/qr",
      "https://api.test/bookings/booking-1/check-in/otp",
      "https://api.test/partner/check-ins/verify-qr",
      "https://api.test/partner/check-ins/verify-otp",
    ]);
    expect(fetcher.mock.calls[4][1]?.body).toBe(
      JSON.stringify({ bookingId: "booking-1", otp: "123456" }),
    );
  });
});
