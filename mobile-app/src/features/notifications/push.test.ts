import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerForPush, unregisterPushOnLogout } from "./push";

const mocks = vi.hoisted(() => ({
  permissions: vi.fn(), request: vi.fn(), token: vi.fn(), channel: vi.fn(),
  get: vi.fn(), set: vi.fn(), del: vi.fn(), register: vi.fn(), unregister: vi.fn(),
}));
vi.mock("react-native", () => ({ Platform: { OS: "android" } }));
vi.mock("expo-notifications", () => ({
  AndroidImportance: { DEFAULT: 3 }, setNotificationChannelAsync: mocks.channel,
  getPermissionsAsync: mocks.permissions, requestPermissionsAsync: mocks.request,
  getExpoPushTokenAsync: mocks.token,
}));
vi.mock("expo-secure-store", () => ({ getItemAsync: mocks.get, setItemAsync: mocks.set, deleteItemAsync: mocks.del }));

describe("push permission and device cleanup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.EXPO_PUBLIC_EAS_PROJECT_ID = "test-project";
    mocks.permissions.mockResolvedValue({ granted: false });
    mocks.request.mockResolvedValue({ granted: true });
    mocks.token.mockResolvedValue({ data: "ExpoPushToken[abcdefghijklmno]" });
    mocks.get.mockResolvedValue(null);
    mocks.register.mockResolvedValue({ id: "device-a" });
  });
  const api = { registerPushDevice: mocks.register, unregisterPushDevice: mocks.unregister };

  it("never prompts without configured Expo project identity", async () => {
    delete process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
    await expect(registerForPush(api as never)).resolves.toBe("configuration-required");
    expect(mocks.request).not.toHaveBeenCalled();
  });
  it("keeps in-app use available when permission is denied", async () => {
    mocks.request.mockResolvedValue({ granted: false });
    await expect(registerForPush(api as never)).resolves.toBe("denied");
    expect(mocks.register).not.toHaveBeenCalled();
  });
  it("registers an authenticated device and saves its ID for rotation or logout", async () => {
    await expect(registerForPush(api as never)).resolves.toBe("registered");
    expect(mocks.token).toHaveBeenCalledWith({ projectId: "test-project" });
    expect(mocks.register).toHaveBeenCalledWith({ platform: "android", token: "ExpoPushToken[abcdefghijklmno]" });
    expect(mocks.set).toHaveBeenCalledWith("gymride.customer.push-device-id", "device-a");
    mocks.get.mockResolvedValue("device-a");
    await registerForPush(api as never);
    expect(mocks.register).toHaveBeenLastCalledWith({ platform: "android", token: "ExpoPushToken[abcdefghijklmno]", deviceId: "device-a" });
  });
  it("attempts server deregistration then clears local device state", async () => {
    mocks.get.mockResolvedValue("device-a");
    await unregisterPushOnLogout(api as never);
    expect(mocks.unregister).toHaveBeenCalledWith("device-a");
    expect(mocks.del).toHaveBeenCalledWith("gymride.customer.push-device-id");
  });
});
