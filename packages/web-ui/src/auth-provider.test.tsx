// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import type { UserProfile } from "@gymride/types";
import { ApiClient, type TokenStore } from "@gymride/api-client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppProviders, AuthGate, useAuth } from "./index";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const profile = (roles: UserProfile["roles"]): UserProfile => ({
  id: "user-1",
  phone: "+919876543210",
  firstName: "Test",
  lastName: "User",
  email: "test@example.com",
  roles,
});

function StatusProbe() {
  return <div data-testid="auth-status">{useAuth().status}</div>;
}

function renderAuth(
  api: ApiClient,
  options: {
    allowedRoles?: UserProfile["roles"];
    allowAuthenticatedWithoutRole?: boolean;
    children?: React.ReactNode;
  } = {},
) {
  return render(
    <AppProviders
      api={api}
      allowedRoles={options.allowedRoles ?? ["ADMIN", "SUPER_ADMIN"]}
      allowAuthenticatedWithoutRole={
        options.allowAuthenticatedWithoutRole ?? false
      }
    >
      {options.children ?? <StatusProbe />}
    </AppProviders>,
  );
}

function mockApi({
  restore,
  user,
}: {
  restore: () => Promise<boolean>;
  user?: UserProfile;
}) {
  return {
    restore: vi.fn(restore),
    request: vi.fn(async (path: string) => {
      if (path === "/users/me" && user) return user;
      throw new Error(`Unexpected request: ${path}`);
    }),
    clearSession: vi.fn(),
    setTokens: vi.fn(),
  } as unknown as ApiClient;
}

describe("shared web auth provider", () => {
  it("transitions from loading to unauthenticated without fetching when no refresh token exists", async () => {
    const fetcher = vi.fn();
    const tokenStore: TokenStore = {
      readRefreshToken: () => null,
      writeRefreshToken: vi.fn(),
      clear: vi.fn(),
    };
    const api = new ApiClient("/api/v1", { tokenStore, fetcher });

    renderAuth(api);

    expect(screen.getByTestId("auth-status").textContent).toBe("loading");
    await waitFor(() =>
      expect(screen.getByTestId("auth-status").textContent).toBe(
        "unauthenticated",
      ),
    );
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("redirects an unauthenticated protected route to login", async () => {
    const assign = vi.fn();
    const originalWindow = window;
    vi.stubGlobal(
      "window",
      new Proxy(originalWindow, {
        get(target, property) {
          if (property === "location")
            return { ...target.location, assign, pathname: "/dashboard" };
          return Reflect.get(target, property, target);
        },
      }),
    );
    const api = mockApi({ restore: async () => false });

    renderAuth(api, {
      children: (
        <AuthGate>
          <div>Protected content</div>
        </AuthGate>
      ),
    });

    await waitFor(() => expect(assign).toHaveBeenCalledWith("/login"));
  });

  it("becomes unauthenticated when restoration fails", async () => {
    const api = mockApi({
      restore: async () => {
        throw new Error("restore failed");
      },
    });

    renderAuth(api);

    expect(await screen.findByText("unauthenticated")).toBeTruthy();
  });

  it("accepts a valid profile as authenticated", async () => {
    const api = mockApi({
      restore: async () => true,
      user: profile(["ADMIN"]),
    });

    renderAuth(api);

    expect(await screen.findByText("authenticated")).toBeTruthy();
  });

  it("publishes forbidden and clears the session for a disallowed profile", async () => {
    const api = mockApi({
      restore: async () => true,
      user: profile(["CUSTOMER"]),
    });

    renderAuth(api);

    expect(await screen.findByText("forbidden")).toBeTruthy();
    expect(api.clearSession).toHaveBeenCalledOnce();
  });

  it("publishes onboarding for a Partner user without a console role", async () => {
    const api = mockApi({
      restore: async () => true,
      user: profile(["CUSTOMER"]),
    });

    renderAuth(api, {
      allowedRoles: ["GYM_OWNER", "GYM_MANAGER", "GYM_STAFF"],
      allowAuthenticatedWithoutRole: true,
    });

    expect(await screen.findByText("onboarding")).toBeTruthy();
  });
});
