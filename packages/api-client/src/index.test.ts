import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ApiClient,
  ApiError,
  createUuid,
  createGymRideApi,
  type TokenStore,
} from "./index";

afterEach(() => vi.unstubAllGlobals());

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

describe("createUuid", () => {
  it("prefers the native randomUUID implementation", () => {
    const randomUUID = vi
      .fn()
      .mockReturnValue("123e4567-e89b-42d3-a456-426614174000");
    const getRandomValues = vi.fn();
    vi.stubGlobal("crypto", { randomUUID, getRandomValues });

    expect(createUuid()).toBe("123e4567-e89b-42d3-a456-426614174000");
    expect(randomUUID).toHaveBeenCalledOnce();
    expect(getRandomValues).not.toHaveBeenCalled();
  });

  it("creates a secure RFC 4122 version 4 UUID when randomUUID is unavailable", () => {
    const getRandomValues = vi.fn((bytes: Uint8Array) => {
      bytes.forEach((_, index) => (bytes[index] = index));
      return bytes;
    });
    vi.stubGlobal("crypto", { getRandomValues });

    expect(createUuid()).toBe("00010203-0405-4607-8809-0a0b0c0d0e0f");
    expect(getRandomValues).toHaveBeenCalledOnce();
  });
});

describe("ApiClient", () => {
  it.each(["Admin", "Partner"])(
    "%s OTP requests use the UUID fallback without throwing",
    async () => {
      vi.stubGlobal("crypto", {
        getRandomValues: (bytes: Uint8Array) => {
          bytes.fill(7);
          return bytes;
        },
      });
      const fetcher = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) =>
        Promise.resolve(response(200, {})),
      );
      const client = new ApiClient("https://api.test", {
        tokenStore: store(),
        fetcher,
      });

      await expect(
        client.request("/auth/otp/request", {
          method: "POST",
          body: JSON.stringify({ phone: "+919876543210" }),
        }),
      ).resolves.toEqual({});
      const headers = fetcher.mock.calls[0]?.[1]?.headers as Headers;
      expect(headers.get("x-request-id")).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
    },
  );

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

  it("surfaces backend validation details instead of a generic message", async () => {
    const client = new ApiClient("https://api.test", {
      tokenStore: store(),
      fetcher: vi.fn(() =>
        Promise.resolve(
          response(400, {
            error: {
              code: "VALIDATION_FAILED",
              message: "Request validation failed",
              details: ["phone must be a valid phone number"],
            },
          }),
        ),
      ),
    });

    await expect(client.request("/partner/branches")).rejects.toMatchObject({
      message: "phone must be a valid phone number",
      details: ["phone must be a valid phone number"],
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

  it("abandons a stalled session restore instead of loading forever", async () => {
    const tokenStore = store();
    tokenStore.token = "stale-refresh";
    const onAuthFailure = vi.fn();
    const fetcher = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          );
        }),
    );
    const client = new ApiClient("https://api.test", {
      tokenStore,
      onAuthFailure,
      fetcher,
      requestTimeoutMs: 1,
    });

    await expect(client.restore()).resolves.toBe(false);
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

  it("normalizes an empty first-time slot configuration response to null", async () => {
    const fetcher = vi.fn(() =>
      Promise.resolve(new Response(null, { status: 200 })),
    );
    const client = new ApiClient("https://api.test", {
      tokenStore: store(),
      fetcher,
    });

    await expect(
      createGymRideApi(client).slots.config("branch-1"),
    ).resolves.toBeNull();
    expect(fetcher).toHaveBeenCalledWith(
      "https://api.test/partner/branches/branch-1/slot-config",
      expect.any(Object),
    );
  });

  it("saves and reloads a typed slot configuration", async () => {
    const config = {
      slotDurationMinutes: 45,
      defaultCapacity: 16,
      bookingWindowDays: 21,
      minimumAdvanceMinutes: 30,
      isActive: true,
    };
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(response(200, config))
      .mockResolvedValueOnce(response(200, config));
    const domain = createGymRideApi(
      new ApiClient("https://api.test", { tokenStore: store(), fetcher }),
    );

    await expect(domain.slots.saveConfig("branch-1", config)).resolves.toEqual(
      config,
    );
    await expect(domain.slots.config("branch-1")).resolves.toEqual(config);
    expect(fetcher.mock.calls[0][1]?.method).toBe("PUT");
    expect(fetcher.mock.calls[0][1]?.body).toBe(JSON.stringify(config));
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
