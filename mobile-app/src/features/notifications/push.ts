import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import type { CustomerApi } from "../../api/customer";

const deviceIdKey = "gymride.customer.push-device-id";

export type PushPermissionResult = "registered" | "denied" | "unavailable" | "configuration-required";

export async function registerForPush(api: CustomerApi): Promise<PushPermissionResult> {
  const projectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
  if (!projectId) return "configuration-required";
  try {
    if (Platform.OS === "android")
      await Notifications.setNotificationChannelAsync("default", { name: "Workout updates", importance: Notifications.AndroidImportance.DEFAULT });
    const existing = await Notifications.getPermissionsAsync();
    const permission = existing.granted ? existing : await Notifications.requestPermissionsAsync();
    if (!permission.granted) return "denied";
    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    const priorId = await SecureStore.getItemAsync(deviceIdKey);
    const device = await api.registerPushDevice({ platform: Platform.OS === "ios" ? "ios" : "android", token, ...(priorId && { deviceId: priorId }) });
    await SecureStore.setItemAsync(deviceIdKey, device.id);
    return "registered";
  } catch {
    return "unavailable";
  }
}

export async function unregisterPushOnLogout(api: CustomerApi): Promise<void> {
  const id = await SecureStore.getItemAsync(deviceIdKey);
  try {
    if (id) await api.unregisterPushDevice(id);
  } finally {
    await SecureStore.deleteItemAsync(deviceIdKey);
  }
}
