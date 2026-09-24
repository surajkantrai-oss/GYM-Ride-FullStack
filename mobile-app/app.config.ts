import type { ExpoConfig } from "expo/config";
const development = process.env.EXPO_PUBLIC_APP_ENV === "development";
const config: ExpoConfig = {
  name: "GYMRide",
  slug: "gymride-customer",
  version: "0.1.0",
  icon: "./assets/brand/app-icon.png",
  orientation: "portrait",
  scheme: "gymride",
  userInterfaceStyle: "light",
  ios: {
    bundleIdentifier: "com.gymride.customer",
    supportsTablet: true,
    infoPlist: development
      ? { NSAppTransportSecurity: { NSAllowsLocalNetworking: true } }
      : {},
  },
  android: {
    package: "com.gymride.customer",
    adaptiveIcon: {
      foregroundImage: "./assets/brand/splash-mark.png",
      backgroundColor: "#F6F5EF",
    },
  },
  plugins: [
    [
      "expo-splash-screen",
      {
        image: "./assets/brand/splash-mark.png",
        imageWidth: 180,
        resizeMode: "contain",
        backgroundColor: "#F6F5EF",
      },
    ],
    "expo-secure-store",
    "expo-notifications",
    [
      "expo-location",
      {
        locationWhenInUsePermission:
          "Use your location once to find gyms nearby. You can also search by city.",
        isIosBackgroundLocationEnabled: false,
        isAndroidBackgroundLocationEnabled: false,
      },
    ],
  ],
};
export default config;
