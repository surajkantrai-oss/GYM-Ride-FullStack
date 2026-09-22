import { Alert } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStack } from "../../navigation/types";
import { Button, Copy, Screen, State, Title } from "../../components/ui";
import { useSession } from "../../store/session";
import { money, remainingSeconds, slotTime } from "../../utils/domain";
export function BookingScreen({
  route,
  navigation,
}: NativeStackScreenProps<RootStack, "Booking">) {
  const { api } = useSession();
  const cache = useQueryClient();
  const { bookingId } = route.params;
  const query = useQuery({
    queryKey: ["booking", bookingId],
    queryFn: () => api.booking(bookingId),
  });
  const cancel = useMutation({
    mutationFn: () => api.cancel(bookingId),
    onSuccess: async () => {
      await cache.invalidateQueries();
    },
  });
  const booking = query.data;
  return (
    <Screen>
      <Title>Booking details</Title>
      <State
        loading={query.isLoading}
        error={query.error || cancel.error}
        retry={() => void query.refetch()}
      />
      {booking && (
        <>
          <Copy>{booking.id}</Copy>
          <Title>{booking.status.replaceAll("_", " ")}</Title>
          <Copy>
            {booking.gym.name} · {booking.branch.name}
          </Copy>
          <Copy>
            {booking.planName} · {money(booking.priceMinor, booking.currency)}
          </Copy>
          {booking.slot && (
            <Copy>
              {slotTime(
                booking.slot.startAt,
                booking.branch.timezone || "Asia/Kolkata",
              )}
            </Copy>
          )}
          <Copy>
            Created {new Date(booking.createdAt).toLocaleDateString()}
          </Copy>
          {booking.payment && (
            <>
              <Copy>
                Payment: {booking.payment.status.replaceAll("_", " ")}
              </Copy>
              {booking.payment.refunds.map((r) => (
                <Copy key={r.id}>
                  Refund {money(r.amount, booking.currency)}: {r.status}
                </Copy>
              ))}
            </>
          )}
          {booking.status === "PAYMENT_PENDING" &&
            remainingSeconds(booking.reservationExpiresAt) > 0 && (
              <Button
                label="Continue payment"
                onPress={() => navigation.navigate("Payment", { bookingId })}
              />
            )}
          {booking.status === "PAYMENT_PENDING" && (
            <Button
              label="Cancel reservation"
              disabled={cancel.isPending}
              onPress={() =>
                Alert.alert(
                  "Cancel reservation?",
                  "The server will decide whether this reservation can be cancelled.",
                  [
                    { text: "Keep booking", style: "cancel" },
                    {
                      text: "Cancel reservation",
                      style: "destructive",
                      onPress: () => cancel.mutate(),
                    },
                  ],
                )
              }
            />
          )}
          {[
            "CONFIRMED",
            "CHECK_IN_AVAILABLE",
            "CHECKED_IN",
            "COMPLETED",
            "NO_SHOW",
          ].includes(booking.status) && (
            <Button
              label="Check-in details"
              onPress={() => navigation.navigate("CheckIn", { bookingId })}
            />
          )}
          {booking.checkIn && (
            <Copy>
              Check-in: {booking.checkIn.status.replaceAll("_", " ")}
              {booking.checkIn.method ? ` via ${booking.checkIn.method}` : ""}
            </Copy>
          )}
          {booking.status === "COMPLETED" && (
            <Button
              label={booking.review ? "View or edit review" : "Leave a review"}
              onPress={() => navigation.navigate("BookingReview", { bookingId })}
            />
          )}
          <Copy>
            Cancellation does not imply a refund. Refund decisions are handled
            by the server.
          </Copy>
          <Button
            label="Refresh details"
            onPress={() => void query.refetch()}
          />
        </>
      )}
    </Screen>
  );
}
