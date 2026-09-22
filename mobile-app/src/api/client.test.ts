import { describe, expect, it, vi } from "vitest";
import { MobileApiClient, MobileApiError } from "./client";
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });
function fixture(fetcher: typeof fetch) {
  let token: string | null = "refresh";
  const expired = vi.fn();
  const store = {
    read: async () => token,
    write: async (value: string) => {
      token = value;
    },
    clear: async () => {
      token = null;
    },
  };
  const client = new MobileApiClient(
    "https://example.test/api/v1",
    store,
    () => "request-id",
    expired,
    fetcher,
  );
  return { client, store, expired };
}
describe("native session and API client", () => {
  it("rejects an in-flight authenticated response after logout cleanup", async () => {
    let finish!: (response: Response) => void;
    const fetcher = vi.fn<typeof fetch>(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const { client, store } = fixture(fetcher);
    await client.setTokens({ accessToken: "old", refreshToken: "old-refresh" });
    const pending = client.request("/users/me");
    const result = expect(pending).rejects.toMatchObject({
      code: "SESSION_EXPIRED",
    });
    await client.clear();
    finish(json({ phone: "private" }));
    await result;
    expect(await store.read()).toBeNull();
  });
  it("adds bearer token and request identity", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json({}));
    const { client } = fixture(fetcher);
    await client.setTokens({ accessToken: "access", refreshToken: "refresh" });
    await client.request("/users/me");
    const headers = new Headers(fetcher.mock.calls[0][1]?.headers);
    expect(headers.get("authorization")).toBe("Bearer access");
    expect(headers.get("x-request-id")).toBe("request-id");
  });
  it("single-flights concurrent refresh and safely replays each request once", async () => {
    let rotations = 0;
    const fetcher = vi.fn<typeof fetch>(async (url, init) => {
      if (String(url).endsWith("/auth/refresh")) {
        rotations++;
        await new Promise((r) => setTimeout(r, 5));
        return json({
          tokens: { accessToken: "new", refreshToken: "rotated" },
        });
      }
      return new Headers(init?.headers).get("authorization") === "Bearer new"
        ? json({ ok: true })
        : json({}, 401);
    });
    const { client, store } = fixture(fetcher);
    await client.setTokens({ accessToken: "old", refreshToken: "refresh" });
    expect(
      await Promise.all([client.request("/a"), client.request("/b")]),
    ).toEqual([{ ok: true }, { ok: true }]);
    expect(rotations).toBe(1);
    expect(await store.read()).toBe("rotated");
  });
  it("restores using secure refresh credential", async () => {
    const { client } = fixture(
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          json({ tokens: { accessToken: "new", refreshToken: "rotated" } }),
        ),
    );
    expect(await client.restore()).toBe(true);
  });
  it("clears secure credential and customer data on refresh failure", async () => {
    const { client, store, expired } = fixture(
      vi.fn<typeof fetch>().mockResolvedValue(json({}, 401)),
    );
    await expect(client.request("/users/me")).rejects.toMatchObject({
      code: "SESSION_EXPIRED",
    });
    expect(await store.read()).toBeNull();
    expect(expired).toHaveBeenCalled();
  });
  it("does not refresh OTP authentication failures", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        json(
          { error: { code: "INVALID_OTP", message: "private detail" } },
          401,
        ),
      );
    const { client } = fixture(fetcher);
    await expect(client.request("/auth/otp/verify", {}, false)).rejects.toEqual(
      new MobileApiError("INVALID_OTP", 401),
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("clears local credentials even if logout fails offline", async () => {
    const { client, store } = fixture(
      vi.fn<typeof fetch>().mockRejectedValue(new Error("offline")),
    );
    await expect(client.logout()).rejects.toMatchObject({
      code: "NETWORK_UNAVAILABLE",
    });
    expect(await store.read()).toBeNull();
  });
  it("never loops when the replay also returns 401", async () => {
    const fetcher = vi.fn<typeof fetch>(async (url) =>
      String(url).endsWith("/auth/refresh")
        ? json({ tokens: { accessToken: "new", refreshToken: "r" } })
        : json({}, 401),
    );
    const { client } = fixture(fetcher);
    await expect(client.request("/users/me")).rejects.toBeInstanceOf(
      MobileApiError,
    );
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
});
