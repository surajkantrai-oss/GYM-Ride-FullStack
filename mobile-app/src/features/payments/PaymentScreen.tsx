import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStack } from "../../navigation/types";
import { Button, Copy, Screen, State, Title } from "../../components/ui";
import { useSession } from "../../store/session";
import { money, remainingSeconds, slotTime } from "../../utils/domain";
import { openCheckout } from "./checkout";
export function PaymentScreen({
  route,
  navigation,
}: NativeStackScreenProps<RootStack, "Payment">) {
  const { api } = useSession();
  const { bookingId } = route.params;
  const cache = useQueryClient();
  const [pollStart, setPollStart] = useState(0);
  const [message, setMessage] = useState("");
  const [now, setNow] = useState(Date.now());
  const booking = useQuery({
    queryKey: ["booking", bookingId],
    queryFn: () => api.booking(bookingId),
    refetchInterval: (query) =>
      query.state.data?.status === "CONFIRMED"
        ? false
        : pollStart && Date.now() - pollStart < 60000
          ? 3000
          : false,
  });
  const seconds = remainingSeconds(booking.data?.reservationExpiresAt, now);
  useEffect(() => {
    if (booking.data?.status === "CONFIRMED")
      void cache.invalidateQueries({ queryKey: ["bookings"] });
  }, [booking.data?.status, cache]);
  useEffect(() => {
    if (booking.data?.status !== "PAYMENT_PENDING") return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [booking.data?.status]);
  useEffect(() => {
    if (booking.data?.status === "PAYMENT_PENDING" && seconds === 0)
      void booking.refetch();
  }, [seconds, booking.data?.status]); // Only refresh at deadline; the server owns expiration.
  const payment = useMutation({
    mutationFn: async () => {
      const order = await api.order(bookingId);
      if (order.provider === "development") {
        setMessage(
          "Development payment: no money is charged. Use the Admin Finance panel to simulate this payment, then refresh.",
        );
        setPollStart(Date.now());
        return;
      }
      const native = (await import("react-native-razorpay")).default;
      const proof = await openCheckout(order, native);
      if (proof) await api.verifyPayment(order.id, proof);
      setMessage("Confirming payment with the server…");
      setPollStart(Date.now());
      await booking.refetch();
    },
    onError: () => {
      setMessage(
        "Checkout did not complete or verification is pending. Refresh your booking before retrying.",
      );
      void booking.refetch();
    },
  });
  const value = booking.data;
  return (
    <Screen>
      <Title>
        {value?.status === "CONFIRMED"
          ? "Your workout is confirmed"
          : value?.status === "EXPIRED"
            ? "Reservation expired"
            : value?.status === "CANCELLED"
              ? "Reservation cancelled"
              : value?.status === "REFUNDED"
                ? "Booking refunded"
                : "Complete your reservation"}
      </Title>
      <State
        loading={booking.isLoading}
        error={booking.error || payment.error}
        retry={() => void booking.refetch()}
      />
      {value && (
        <>
          <Copy>
            {value.gym.name} · {value.branch.name} · {value.planName}
          </Copy>
          <Title>{money(value.priceMinor, value.currency)}</Title>
          <Copy>Booking: {value.id}</Copy>
          <Copy>Status: {value.status.replaceAll("_", " ")}</Copy>
          {value.slot && (
            <Copy>
              {slotTime(
                value.slot.startAt,
                value.branch.timezone || "Asia/Kolkata",
              )}
            </Copy>
          )}
          {value.payment && (
            <Copy>Payment: {value.payment.status.replaceAll("_", " ")}</Copy>
          )}
          {value.status === "PAYMENT_PENDING" && (
            <>
              <Copy>
                {seconds > 0
                  ? `Reservation time remaining: ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
                  : "Reservation deadline reached. Checking server status…"}
              </Copy>
              <Button
                label="Continue to payment"
                disabled={seconds === 0 || payment.isPending}
                onPress={() => payment.mutate()}
              />
            </>
          )}
          <Copy>
            {value.status === "CONFIRMED"
              ? "Payment verified by the server."
              : message}
          </Copy>
          <Button
            label="Refresh booking status"
            onPress={() => void booking.refetch()}
          />
          <Button
            label="View booking details"
            onPress={() => navigation.replace("Booking", { bookingId })}
          />
        </>
      )}
    </Screen>
  );
}
