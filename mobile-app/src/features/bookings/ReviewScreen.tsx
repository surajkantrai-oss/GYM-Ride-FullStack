import { useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { randomUUID } from "expo-crypto";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStack } from "../../navigation/types";
import { Button, Copy, Screen, State, Title } from "../../components/ui";
import { useSession } from "../../store/session";
import { money, slotTime } from "../../utils/domain";
export function ReviewScreen({
  route,
  navigation,
}: NativeStackScreenProps<RootStack, "Review">) {
  const { api } = useSession();
  const cache = useQueryClient();
  const { gym, branch, plan, slot } = route.params;
  const key = useMemo(() => randomUUID(), [branch.id, plan.id, slot?.id]);
  const reserve = useMutation({
    mutationFn: () =>
      api.reserve(
        {
          branchId: branch.id,
          planId: plan.id,
          ...(slot ? { slotId: slot.id } : {}),
        },
        key,
      ),
    onSuccess: async (booking) => {
      await cache.invalidateQueries({ queryKey: ["bookings"] });
      navigation.replace("Payment", { bookingId: booking.id });
    },
  });
  return (
    <Screen>
      <Title>Review your workout</Title>
      <Copy>
        {gym.name} · {branch.name}
      </Copy>
      <Copy>{plan.name}</Copy>
      {slot && (
        <Copy>
          {slotTime(slot.startAt, branch.timezone)} —{" "}
          {slotTime(slot.endAt, branch.timezone)}
        </Copy>
      )}
      <Title>{money(plan.priceMinor, plan.currency)}</Title>
      <Copy>
        Price and availability will be validated by the server. Your place is
        confirmed only after payment verification.
      </Copy>
      <State loading={reserve.isPending} error={reserve.error} />
      <Button
        label="Reserve and continue"
        disabled={reserve.isPending}
        onPress={() => reserve.mutate()}
      />
    </Screen>
  );
}
