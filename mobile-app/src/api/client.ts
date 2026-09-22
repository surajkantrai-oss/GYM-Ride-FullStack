import type { Tokens, BackendErrorBody } from "@gymride/types";

export interface SecureSessionStore {
  read(): Promise<string | null>;
  write(token: string): Promise<void>;
  clear(): Promise<void>;
}
export class MobileApiError extends Error {
  constructor(
    public readonly code: string,
    public readonly status = 0,
  ) {
    super(code);
    this.name = "MobileApiError";
  }
}
/** Native async credential storage cannot use the web client's synchronous sessionStorage contract. */
export class MobileApiClient {
  private access: string | null = null;
  private flight: Promise<void> | null = null;
  private generation = 0;
  private storageWork: Promise<void> = Promise.resolve();
  constructor(
    private readonly baseUrl: string,
    private readonly store: SecureSessionStore,
    private readonly uuid: () => string,
    private readonly onExpired: () => void,
    private readonly fetcher: typeof fetch = fetch,
  ) {}
  private storage(action: () => Promise<void>) {
    const result = this.storageWork.then(action, action);
    this.storageWork = result.catch(() => {});
    return result;
  }
  async setTokens(tokens: Tokens, generation = this.generation) {
    await this.storage(async () => {
      if (generation === this.generation)
        await this.store.write(tokens.refreshToken);
    });
    if (generation === this.generation) this.access = tokens.accessToken;
  }
  async clear() {
    this.generation++;
    this.access = null;
    this.onExpired();
    await this.storage(() => this.store.clear());
  }
  async restore() {
    if (!(await this.store.read())) return false;
    try {
      await this.refresh();
      return true;
    } catch {
      return false;
    }
  }
  async logout() {
    try {
      await this.request("/auth/logout", { method: "POST" }, true, false);
    } finally {
      await this.clear();
    }
  }
  async request<T>(
    path: string,
    init: RequestInit = {},
    authenticated = true,
    replay = true,
  ): Promise<T> {
    if (!this.baseUrl) throw new MobileApiError("CONFIGURATION_REQUIRED");
    const generation = this.generation;
    const token = this.access;
    const headers = new Headers(init.headers);
    headers.set("x-request-id", this.uuid());
    if (init.body) headers.set("content-type", "application/json");
    if (authenticated && token) headers.set("authorization", `Bearer ${token}`);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    let response: Response;
    try {
      response = await this.fetcher(`${this.baseUrl}${path}`, {
        ...init,
        headers,
        signal: controller.signal,
      });
    } catch {
      throw new MobileApiError(
        controller.signal.aborted ? "TIMEOUT" : "NETWORK_UNAVAILABLE",
      );
    } finally {
      clearTimeout(timeout);
    }
    if (authenticated && generation !== this.generation)
      throw new MobileApiError("SESSION_EXPIRED", 401);
    if (response.status === 401 && authenticated && replay) {
      // A late 401 from the old token must not rotate the newly refreshed session again.
      if (token === this.access) await this.refresh();
      return this.request<T>(path, init, authenticated, false);
    }
    if (response.status === 401 && authenticated) await this.clear();
    if (!response.ok) {
      let body: BackendErrorBody = {};
      try {
        body = await response.json();
      } catch {
        /* upstream may not return JSON */
      }
      const nested = typeof body.error === "object" ? body.error : undefined;
      throw new MobileApiError(
        nested?.code ?? `HTTP_${response.status}`,
        response.status,
      );
    }
    return response.status === 204
      ? (undefined as T)
      : (response.json() as Promise<T>);
  }
  private refresh() {
    if (!this.flight)
      this.flight = this.rotate().finally(() => {
        this.flight = null;
      });
    return this.flight;
  }
  private async rotate() {
    const generation = this.generation;
    try {
      const refreshToken = await this.store.read();
      if (!refreshToken) throw new MobileApiError("SESSION_EXPIRED", 401);
      const result = await this.request<{ tokens: Tokens }>(
        "/auth/refresh",
        { method: "POST", body: JSON.stringify({ refreshToken }) },
        false,
      );
      if (generation !== this.generation)
        throw new MobileApiError("SESSION_EXPIRED", 401);
      await this.setTokens(result.tokens, generation);
    } catch {
      if (generation === this.generation) await this.clear();
      throw new MobileApiError("SESSION_EXPIRED", 401);
    }
  }
}
