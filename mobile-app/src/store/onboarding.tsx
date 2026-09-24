import { createContext, useContext, useEffect, useState } from "react";
import * as SecureStore from "expo-secure-store";

const storageKey = "gymride.customer.onboarding.v1";

type OnboardingState = {
  completed: boolean;
  shouldShow: boolean;
  restoring: boolean;
  complete: () => Promise<void>;
};

const Context = createContext<OnboardingState | null>(null);

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const [completed, setCompleted] = useState(false);
  const [completedThisLaunch, setCompletedThisLaunch] = useState(false);
  const [restoring, setRestoring] = useState(true);

  useEffect(() => {
    let active = true;
    void SecureStore.getItemAsync(storageKey)
      .then((value) => {
        if (active) setCompleted(value === "completed");
      })
      .catch(() => {
        // If device storage is unavailable, onboarding remains safely incomplete.
      })
      .finally(() => {
        if (active) setRestoring(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const complete = async () => {
    await SecureStore.setItemAsync(storageKey, "completed", {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
    setCompleted(true);
    setCompletedThisLaunch(true);
  };

  // Production behavior remains: show onboarding until the persisted flag is complete.
  // Development override: show it once per JS app launch, then continue normally.
  const shouldShow = !completed || (__DEV__ && !completedThisLaunch);

  return (
    <Context.Provider value={{ completed, shouldShow, restoring, complete }}>
      {children}
    </Context.Provider>
  );
}

export function useOnboarding() {
  const value = useContext(Context);
  if (!value) throw new Error("OnboardingProvider required");
  return value;
}
