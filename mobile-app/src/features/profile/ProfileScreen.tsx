import { useState } from "react";
import { StyleSheet, Switch, Text, View } from "react-native";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Button,
  Card,
  Copy,
  Input,
  Screen,
  SectionTitle,
  State,
  palette,
} from "../../components/ui";
import { AppHeader } from "../../components/headers";
import { useSession } from "../../store/session";
import {
  registerForPush,
  type PushPermissionResult,
} from "../notifications/push";
export function ProfileScreen() {
  const { api, logout, updateUser } = useSession();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [pushResult, setPushResult] = useState<PushPermissionResult | null>(
    null,
  );
  const [enablingPush, setEnablingPush] = useState(false);
  const query = useQuery({ queryKey: ["profile"], queryFn: () => api.me() });
  const preferences = useQuery({
    queryKey: ["notification-preferences"],
    queryFn: () => api.notificationPreferences(),
  });
  const preferenceUpdate = useMutation({
    mutationFn: (input: {
      category: "BOOKING" | "CHECK_IN" | "MARKETING";
      pushEnabled: boolean;
    }) => api.updateNotificationPreference(input),
    onSuccess: () => void preferences.refetch(),
  });
  const update = useMutation({
    mutationFn: () =>
      api.updateProfile({
        ...(firstName.trim() ? { firstName: firstName.trim() } : {}),
        ...(lastName.trim() ? { lastName: lastName.trim() } : {}),
        ...(email.trim() ? { email: email.trim() } : {}),
      }),
    onSuccess: (user) => {
      updateUser(user);
      void query.refetch();
    },
  });
  return (
    <Screen top>
      <AppHeader
        eyebrow="ACCOUNT"
        title="Your profile"
        subtitle="Personal details, preferences and security"
        avatarLabel={query.data?.firstName || "G"}
      />
      <State
        loading={query.isLoading}
        error={query.error || update.error}
        retry={() => void query.refetch()}
      />
      {query.data && (
        <>
          <Card tone="highlight">
            <View style={local.profileRow}>
              <View style={local.avatar}>
                <Text style={local.avatarText}>
                  {(query.data.firstName || "G").slice(0, 1).toUpperCase()}
                </Text>
              </View>
              <View style={local.identity}>
                <SectionTitle>
                  {[query.data.firstName, query.data.lastName]
                    .filter(Boolean)
                    .join(" ") || "GYMRide member"}
                </SectionTitle>
                <Copy>{query.data.phone}</Copy>
                <Copy>{query.data.email || "Add your email"}</Copy>
              </View>
            </View>
          </Card>
          <SectionTitle>Account details</SectionTitle>
          <Card>
            <Input
              label="First name"
              value={firstName}
              placeholder={query.data.firstName || "First name"}
              onChangeText={setFirstName}
              maxLength={100}
            />
            <Input
              label="Last name"
              value={lastName}
              placeholder={query.data.lastName || "Last name"}
              onChangeText={setLastName}
              maxLength={100}
            />
            <Input
              label="Email"
              value={email}
              placeholder={query.data.email || "Email"}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
            />
            <Button
              label="Save profile"
              disabled={update.isPending || !(firstName || lastName || email)}
              onPress={() => update.mutate()}
            />
            {update.isSuccess && <Copy>Profile updated.</Copy>}
          </Card>
        </>
      )}
      <SectionTitle>Notification preferences</SectionTitle>
      <Copy>
        In-app service updates remain available even if push is off. Promotional
        updates are off by default.
      </Copy>
      <State
        loading={preferences.isLoading}
        error={preferences.error || preferenceUpdate.error}
        retry={() => void preferences.refetch()}
      />
      {(["BOOKING", "CHECK_IN", "MARKETING"] as const).map((category) => {
        const enabled =
          preferences.data?.find((item) => item.category === category)
            ?.pushEnabled ?? false;
        return (
          <View key={category} style={local.setting}>
            <View>
              <Text style={local.settingTitle}>
                {category.replaceAll("_", " ")}
              </Text>
              <Text style={local.settingDetail}>
                {category === "MARKETING"
                  ? "Offers and product news"
                  : "Important service updates"}
              </Text>
            </View>
            <Switch
              value={enabled}
              disabled={preferenceUpdate.isPending || !preferences.data}
              onValueChange={(pushEnabled) =>
                preferenceUpdate.mutate({ category, pushEnabled })
              }
              trackColor={{ false: palette.border, true: palette.accent }}
            />
          </View>
        );
      })}
      <Button
        variant="secondary"
        label="Enable device push notifications"
        disabled={enablingPush}
        onPress={() => {
          setEnablingPush(true);
          void registerForPush(api)
            .then(setPushResult)
            .finally(() => setEnablingPush(false));
        }}
      />
      {pushResult && (
        <Copy>
          {pushResult === "registered"
            ? "Push is enabled on this device."
            : pushResult === "denied"
              ? "Push permission was declined. In-app notifications still work."
              : pushResult === "configuration-required"
                ? "Push needs an Expo project ID. In-app notifications still work."
                : "Push is unavailable on this device right now. In-app notifications still work."}
        </Copy>
      )}
      <SectionTitle>Security</SectionTitle>
      <Button variant="danger" label="Log out" onPress={() => void logout()} />
    </Screen>
  );
}

const local = StyleSheet.create({
  profileRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  avatar: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: palette.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: "#FFFFFF", fontSize: 25, fontWeight: "900" },
  identity: { flex: 1, gap: 2 },
  setting: {
    minHeight: 68,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 16,
  },
  settingTitle: { fontSize: 14, fontWeight: "800", color: palette.ink },
  settingDetail: { fontSize: 12, color: palette.muted, marginTop: 3 },
});
