import { useEffect, useState } from "react";
import { View } from "react-native";
import QRCode from "react-native-qrcode-svg";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStack } from "../../navigation/types";
import { Button, Card, Copy, Screen, State, Title } from "../../components/ui";
import { useSession } from "../../store/session";

export const secondsLeft = (value?: string, now = Date.now()) =>
  value ? Math.max(0, Math.ceil((new Date(value).getTime() - now) / 1000)) : 0;

export function CheckInScreen({
  route,
}: NativeStackScreenProps<RootStack, "CheckIn">) {
  const { api } = useSession();
  const cache = useQueryClient();
  const { bookingId } = route.params;
  const [clock, setClock] = useState(Date.now());
  const status = useQuery({
    queryKey: ["check-in", bookingId],
    queryFn: () => api.checkInStatus(bookingId),
    refetchInterval: 30_000,
  });
  const qr = useMutation({ mutationFn: () => api.checkInQr(bookingId) });
  const otp = useMutation({ mutationFn: () => api.checkInOtp(bookingId) });

  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const qrRemaining = secondsLeft(qr.data?.expiresAt, clock);
  const qrActive = Boolean(qr.data && qrRemaining > 0);

  const current = status.data;
  const terminal = ["CHECKED_IN", "COMPLETED", "NO_SHOW"].includes(
    current?.bookingStatus ?? "",
  );
  return (
    <Screen>
      <Title>Secure gym check-in</Title>
      <State
        loading={status.isLoading}
        error={status.error || qr.error || otp.error}
        retry={() => void status.refetch()}
      />
      {current && (
        <>
          <Card>
            <Copy>Booking {current.bookingId}</Copy>
            <Title>{current.bookingStatus.replaceAll("_", " ")}</Title>
            <Copy>
              {current.gym.name} · {current.branch.name}
            </Copy>
            <Copy>{current.planName}</Copy>
            {current.slot && (
              <Copy>
                {new Intl.DateTimeFormat("en-IN", {
                  timeZone: current.branch.timezone,
                  dateStyle: "medium",
                  timeStyle: "short",
                }).format(new Date(current.slot.startAt))}
              </Copy>
            )}
            {current.window && (
              <Copy>
                Window {new Date(current.window.opensAt).toLocaleTimeString()} –{" "}
                {new Date(current.window.closesAt).toLocaleTimeString()}
              </Copy>
            )}
            {!current.eligible && current.bookingStatus === "CONFIRMED" && (
              <Copy>
                Your secure credential becomes available when the check-in
                window opens.
              </Copy>
            )}
            {current.bookingStatus === "NO_SHOW" && (
              <Copy>
                The server closed this booking without a verified check-in.
              </Copy>
            )}
            {current.checkIn?.verifiedAt && (
              <Copy>
                Verified {new Date(current.checkIn.verifiedAt).toLocaleString()}
              </Copy>
            )}
          </Card>
          {current.eligible && qr.data && qrActive && (
            <Card>
              <View
                accessible
                accessibilityLabel="Secure check-in QR code"
                style={{ alignItems: "center" }}
              >
                <QRCode value={qr.data.token} size={220} quietZone={12} />
              </View>
              <Copy>Expires in {qrRemaining} seconds</Copy>
              <Button
                label="Regenerate QR"
                disabled={qr.isPending}
                onPress={() => qr.mutate()}
              />
            </Card>
          )}
          {current.eligible && !qrActive && (
            <Button
              label="Generate secure QR"
              disabled={qr.isPending}
              onPress={() => qr.mutate()}
            />
          )}
          {current.eligible && otp.data && (
            <Card>
              <Copy>Fallback OTP</Copy>
              <Title>{otp.data.code}</Title>
              <Copy>
                Expires in {secondsLeft(otp.data.expiresAt, clock)} seconds.
                Show this only to gym staff.
              </Copy>
            </Card>
          )}
          {current.eligible && !otp.data && (
            <Button
              label="Use fallback OTP"
              disabled={otp.isPending}
              onPress={() => otp.mutate()}
            />
          )}
          {terminal && (
            <Button
              label="Refresh status"
              onPress={() => {
                void status.refetch();
                void cache.invalidateQueries({
                  queryKey: ["booking", bookingId],
                });
              }}
            />
          )}
        </>
      )}
    </Screen>
  );
}
