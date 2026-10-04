import type {
  BackendErrorBody,
  Booking,
  CheckInOtpCredential,
  CheckInQrCredential,
  CheckInStatusResponse,
  CheckInVerificationResult,
  GymPlan,
  PaginatedResponse,
  SlotAvailability,
  SlotConfig,
  Tokens,
} from "@gymride/types";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly requestId?: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function createUuid() {
  const cryptoApi = globalThis.crypto;
  if (typeof cryptoApi?.randomUUID === "function")
    return cryptoApi.randomUUID();
  if (typeof cryptoApi?.getRandomValues !== "function")
    throw new Error("Secure random number generation is not available.");

  const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function createGymRideApi(client: ApiClient) {
  return {
    plans: {
      list: (gymId: string) =>
        client.request<GymPlan[]>(`/partner/gyms/${gymId}/plans`),
      get: (planId: string) =>
        client.request<GymPlan>(`/partner/plans/${planId}`),
      create: (gymId: string, input: unknown) =>
        client.request<GymPlan>(`/partner/gyms/${gymId}/plans`, {
          method: "POST",
          body: JSON.stringify(input),
        }),
      update: (planId: string, input: unknown) =>
        client.request<GymPlan>(`/partner/plans/${planId}`, {
          method: "PATCH",
          body: JSON.stringify(input),
        }),
      activate: (planId: string) =>
        client.request<GymPlan>(`/partner/plans/${planId}/activate`, {
          method: "POST",
        }),
      deactivate: (planId: string) =>
        client.request<GymPlan>(`/partner/plans/${planId}/deactivate`, {
          method: "POST",
        }),
    },
    slots: {
      config: (branchId: string) =>
        client
          .request<SlotConfig | null | undefined>(
            `/partner/branches/${branchId}/slot-config`,
          )
          .then((value) => value ?? null),
      saveConfig: (branchId: string, input: SlotConfig) =>
        client.request<SlotConfig>(
          `/partner/branches/${branchId}/slot-config`,
          { method: "PUT", body: JSON.stringify(input) },
        ),
      availability: (branchId: string, date: string) =>
        client.request<SlotAvailability[]>(
          `/partner/branches/${branchId}/availability?${new URLSearchParams({ date })}`,
        ),
    },
    bookings: {
      mine: (params = "") =>
        client.request<PaginatedResponse<Booking>>(`/bookings${params}`),
      partner: (params = "") =>
        client.request<PaginatedResponse<Booking>>(
          `/partner/bookings${params}`,
        ),
      admin: (params = "") =>
        client.request<PaginatedResponse<Booking>>(`/admin/bookings${params}`),
      getPartner: (id: string) =>
        client.request<Booking>(`/partner/bookings/${id}`),
      getAdmin: (id: string) =>
        client.request<Booking>(`/admin/bookings/${id}`),
    },
    checkIns: {
      status: (bookingId: string) =>
        client.request<CheckInStatusResponse>(
          `/bookings/${bookingId}/check-in`,
        ),
      qr: (bookingId: string) =>
        client.request<CheckInQrCredential>(
          `/bookings/${bookingId}/check-in/qr`,
          { method: "POST" },
        ),
      otp: (bookingId: string) =>
        client.request<CheckInOtpCredential>(
          `/bookings/${bookingId}/check-in/otp`,
          { method: "POST" },
        ),
      verifyQr: (token: string) =>
        client.request<CheckInVerificationResult>(
          "/partner/check-ins/verify-qr",
          { method: "POST", body: JSON.stringify({ token }) },
        ),
      verifyOtp: (bookingId: string, otp: string) =>
        client.request<CheckInVerificationResult>(
          "/partner/check-ins/verify-otp",
          { method: "POST", body: JSON.stringify({ bookingId, otp }) },
        ),
    },
  };
}

export interface TokenStore {
  readRefreshToken(): string | null;
  writeRefreshToken(token: string): void;
  clear(): void;
}

export class SessionTokenStore implements TokenStore {
  private readonly key: string;

  constructor(namespace: string) {
    this.key = `gymride:${namespace}:refresh`;
  }

  readRefreshToken() {
    return typeof window === "undefined"
      ? null
      : window.sessionStorage.getItem(this.key);
  }

  writeRefreshToken(token: string) {
    if (typeof window !== "undefined")
      window.sessionStorage.setItem(this.key, token);
  }

  clear() {
    if (typeof window !== "undefined")
      window.sessionStorage.removeItem(this.key);
  }
}

interface ClientOptions {
  tokenStore: TokenStore;
  onAuthFailure?: () => void;
  fetcher?: typeof fetch;
  requestTimeoutMs?: number;
}

export class ApiClient {
  private accessToken: string | null = null;
  private refreshPromise: Promise<string> | null = null;
  private readonly fetcher: typeof fetch;
  private readonly requestTimeoutMs: number;

  constructor(
    private readonly baseUrl: string,
    private readonly options: ClientOptions,
  ) {
    this.fetcher = options.fetcher ?? globalThis.fetch.bind(globalThis);
    this.requestTimeoutMs = options.requestTimeoutMs ?? 10_000;
  }

  setTokens(tokens: Tokens) {
    this.accessToken = tokens.accessToken;
    this.options.tokenStore.writeRefreshToken(tokens.refreshToken);
  }

  clearSession() {
    this.accessToken = null;
    this.options.tokenStore.clear();
  }

  async restore() {
    if (!this.options.tokenStore.readRefreshToken()) return false;
    try {
      await this.refreshAccessToken();
      return true;
    } catch {
      return false;
    }
  }

  async request<T>(
    path: string,
    init: RequestInit = {},
    retry = true,
  ): Promise<T> {
    if (!this.baseUrl)
      throw new ApiError("NEXT_PUBLIC_API_BASE_URL is not configured", 0);
    const headers = new Headers(init.headers);
    headers.set("x-request-id", createUuid());
    if (init.body && !(init.body instanceof FormData))
      headers.set("content-type", "application/json");
    if (this.accessToken)
      headers.set("authorization", `Bearer ${this.accessToken}`);

    const controller = new AbortController();
    let timedOut = false;
    const abortFromCaller = () => controller.abort();
    if (init.signal?.aborted) controller.abort();
    else
      init.signal?.addEventListener("abort", abortFromCaller, { once: true });
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.requestTimeoutMs);
    let response: Response;
    try {
      response = await this.fetcher(`${this.baseUrl}${path}`, {
        ...init,
        headers,
        signal: controller.signal,
      });
    } catch (error) {
      if (timedOut)
        throw new ApiError("The server took too long to respond.", 0);
      throw error;
    } finally {
      clearTimeout(timeout);
      init.signal?.removeEventListener("abort", abortFromCaller);
    }
    if (response.status === 401 && retry && path !== "/auth/refresh") {
      await this.refreshAccessToken();
      return this.request<T>(path, init, false);
    }
    if (!response.ok) throw await this.toError(response);
    if (response.status === 204) return undefined as T;
    const body = await response.text();
    if (!body.trim()) return undefined as T;
    return JSON.parse(body) as T;
  }

  private async refreshAccessToken() {
    if (!this.refreshPromise) {
      this.refreshPromise = this.performRefresh().finally(() => {
        this.refreshPromise = null;
      });
    }
    return this.refreshPromise;
  }

  private async performRefresh() {
    const refreshToken = this.options.tokenStore.readRefreshToken();
    if (!refreshToken) return this.failAuthentication();
    try {
      const result = await this.request<{ tokens: Tokens }>(
        "/auth/refresh",
        { method: "POST", body: JSON.stringify({ refreshToken }) },
        false,
      );
      this.setTokens(result.tokens);
      return result.tokens.accessToken;
    } catch (error) {
      this.failAuthentication();
      throw error;
    }
  }

  private failAuthentication(): never {
    this.clearSession();
    this.options.onAuthFailure?.();
    throw new ApiError("Your session has expired. Please sign in again.", 401);
  }

  private async toError(response: Response) {
    let body: BackendErrorBody = {};
    try {
      body = (await response.json()) as BackendErrorBody;
    } catch {
      // A non-JSON upstream error is still normalized for consumers.
    }
    const nested = typeof body.error === "object" ? body.error : undefined;
    const validationDetails = Array.isArray(nested?.details)
      ? nested.details.filter(
          (detail): detail is string => typeof detail === "string",
        )
      : [];
    const message = Array.isArray(body.message)
      ? body.message.join(", ")
      : body.message ||
        (nested?.message === "Request validation failed" &&
        validationDetails.length
          ? validationDetails.join(", ")
          : undefined) ||
        nested?.message ||
        (typeof body.error === "string" ? body.error : undefined) ||
        `Request failed (${response.status})`;
    return new ApiError(
      message,
      response.status,
      body.requestId,
      nested?.details ?? body,
    );
  }
}
