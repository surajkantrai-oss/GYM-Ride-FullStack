import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button, Copy, Input, Screen, State, Title } from "../../components/ui";
import { useSession } from "../../store/session";
import { registerForPush, type PushPermissionResult } from "../notifications/push";
export function ProfileScreen() {
  const { api, logout, updateUser } = useSession();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [pushResult, setPushResult] = useState<PushPermissionResult | null>(null);
  const [enablingPush, setEnablingPush] = useState(false);
  const query = useQuery({ queryKey: ["profile"], queryFn: () => api.me() });
  const preferences = useQuery({ queryKey: ["notification-preferences"], queryFn: () => api.notificationPreferences() });
  const preferenceUpdate = useMutation({ mutationFn: (input: { category: "BOOKING" | "CHECK_IN" | "MARKETING"; pushEnabled: boolean }) => api.updateNotificationPreference(input), onSuccess: () => void preferences.refetch() });
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
    <Screen>
      <Title>Your profile</Title>
      <State
        loading={query.isLoading}
        error={query.error || update.error}
        retry={() => void query.refetch()}
      />
      {query.data && (
        <>
          <Copy>{query.data.phone}</Copy>
          <Copy>
            {query.data.firstName} {query.data.lastName}
          </Copy>
          <Copy>{query.data.email}</Copy>
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
        </>
      )}
      <Title>Notification settings</Title>
      <Copy>In-app service updates remain available even if push is off. Promotional updates are off by default.</Copy>
      <State loading={preferences.isLoading} error={preferences.error || preferenceUpdate.error} retry={() => void preferences.refetch()} />
      {(["BOOKING", "CHECK_IN", "MARKETING"] as const).map((category) => {
        const enabled = preferences.data?.find((item) => item.category === category)?.pushEnabled ?? false;
        return <Button key={category} label={`${category.replaceAll("_", " ").toLowerCase()} push: ${enabled ? "on" : "off"}`} disabled={preferenceUpdate.isPending || !preferences.data} onPress={() => preferenceUpdate.mutate({ category, pushEnabled: !enabled })} />;
      })}
      <Button label="Enable device push notifications" disabled={enablingPush} onPress={() => {
        setEnablingPush(true);
        void registerForPush(api).then(setPushResult).finally(() => setEnablingPush(false));
      }} />
      {pushResult && <Copy>{pushResult === "registered" ? "Push is enabled on this device." : pushResult === "denied" ? "Push permission was declined. In-app notifications still work." : pushResult === "configuration-required" ? "Push needs an Expo project ID. In-app notifications still work." : "Push is unavailable on this device right now. In-app notifications still work."}</Copy>}
      <Button label="Log out" onPress={() => void logout()} />
    </Screen>
  );
}
