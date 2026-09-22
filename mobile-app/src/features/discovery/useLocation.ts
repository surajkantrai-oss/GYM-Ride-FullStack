import { useState } from "react";
import * as Location from "expo-location";
export function useDiscoveryLocation() {
  const [coordinates, setCoordinates] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [status, setStatus] = useState<
    "idle" | "loading" | "granted" | "denied" | "restricted" | "unavailable"
  >("idle");
  async function locate() {
    setStatus("loading");
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        setStatus(permission.canAskAgain ? "denied" : "restricted");
        return;
      }
      if (!(await Location.hasServicesEnabledAsync())) {
        setStatus("unavailable");
        return;
      }
      let timer: ReturnType<typeof setTimeout> | undefined;
      const location = await Promise.race([
        Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
          mayShowUserSettingsDialog: false,
        }),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error("Location timeout")),
            15000,
          );
        }),
      ]).finally(() => {
        if (timer) clearTimeout(timer);
      });
      setCoordinates({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      });
      setStatus("granted");
    } catch {
      setStatus("unavailable");
    }
  }
  return {
    coordinates,
    status,
    locate,
    clear: () => {
      setCoordinates(null);
      setStatus("idle");
    },
  };
}
