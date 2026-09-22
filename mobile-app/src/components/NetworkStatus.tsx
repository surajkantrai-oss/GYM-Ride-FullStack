import { useEffect, useState } from "react";
import NetInfo from "@react-native-community/netinfo";
import { View, Text } from "react-native";
import { palette } from "./ui";
/** No persisted/queued writes: mutations use networkMode always and fail through the API client. */
export function NetworkStatus() {
  const [offline, setOffline] = useState(false);
  useEffect(
    () =>
      NetInfo.addEventListener((state) =>
        setOffline(
          state.isConnected === false || state.isInternetReachable === false,
        ),
      ),
    [],
  );
  return offline ? (
    <View style={{ backgroundColor: palette.danger, padding: 12 }}>
      <Text accessibilityRole="alert" style={{ color: "#FFFFFF" }}>
        You are offline. Reconnect to book or pay. Previously loaded information
        may be out of date.
      </Text>
    </View>
  ) : null;
}
