import { createContext, useContext, useEffect, useState } from "react";
import * as SecureStore from "expo-secure-store";
import { randomUUID } from "expo-crypto";
import { QueryClient } from "@tanstack/react-query";
import type { AuthResponse, UserProfile } from "@gymride/types";
import { MobileApiClient, MobileApiError } from "../api/client";
import { customerApi, type CustomerApi } from "../api/customer";
import { validateApiUrl } from "../config/environment";
import { unregisterPushOnLogout } from "../features/notifications/push";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30000 },
    mutations: { retry: false, networkMode: "always" },
  },
});
type Session = {
  user: UserProfile | null;
  restoring: boolean;
  api: CustomerApi;
  signIn: (result: AuthResponse) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (user: UserProfile) => void;
};
const Context = createContext<Session | null>(null);
const storageKey = "gymride.customer.refresh";
export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [restoring, setRestoring] = useState(true);
  const [client] = useState(
    () =>
      new MobileApiClient(
        validateApiUrl(
          process.env.EXPO_PUBLIC_API_BASE_URL,
          process.env.EXPO_PUBLIC_APP_ENV,
        ),
        {
          read: () => SecureStore.getItemAsync(storageKey),
          write: (token) =>
            SecureStore.setItemAsync(storageKey, token, {
              keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
            }),
          clear: () => SecureStore.deleteItemAsync(storageKey),
        },
        randomUUID,
        () => {
          queryClient.clear();
          setUser(null);
        },
      ),
  );
  const [api] = useState(() => customerApi(client));
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        if (await client.restore()) {
          const current = await api.me();
          if (!current.roles.includes("CUSTOMER")) await client.clear();
          else if (active) setUser(current);
        }
      } catch {
        try {
          await client.clear();
        } catch {
          /* Device storage unavailable; remain signed out. */
        }
      } finally {
        if (active) setRestoring(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [api, client]);
  const signIn = async (result: AuthResponse) => {
    if (!result.user.roles.includes("CUSTOMER"))
      throw new MobileApiError("CUSTOMER_ACCOUNT_REQUIRED", 403);
    await client.setTokens(result.tokens);
    setUser(result.user);
  };
  const logout = async () => {
    try {
      await unregisterPushOnLogout(api);
    } catch {
      /* Offline logout must still clear the local session. */
    }
    try {
      await client.logout();
    } catch {
      /* local cleanup always happens */
    }
  };
  return (
    <Context.Provider
      value={{ user, restoring, api, signIn, logout, updateUser: setUser }}
    >
      {children}
    </Context.Provider>
  );
}
export function useSession() {
  const session = useContext(Context);
  if (!session) throw new Error("SessionProvider required");
  return session;
}
