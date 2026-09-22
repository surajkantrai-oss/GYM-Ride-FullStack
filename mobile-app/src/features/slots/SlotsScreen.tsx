import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStack } from "../../navigation/types";
import {
  Button,
  Card,
  Copy,
  Input,
  Screen,
  State,
  Title,
} from "../../components/ui";
import { useSession } from "../../store/session";
import { slotTime } from "../../utils/domain";
export function SlotsScreen({
  route,
  navigation,
}: NativeStackScreenProps<RootStack, "Slots">) {
  const { api } = useSession();
  const [date, setDate] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const { branch, plan } = route.params;
  const query = useQuery({
    queryKey: ["slots", branch.id, plan.id, selectedDate],
    enabled: !!selectedDate,
    queryFn: () => api.slots(branch.id, selectedDate, plan.id),
  });
  return (
    <Screen>
      <Title>Make time for yourself</Title>
      <Copy>Times are shown in {branch.timezone}.</Copy>
      <Input
        label="Date (YYYY-MM-DD)"
        placeholder="YYYY-MM-DD"
        value={date}
        onChangeText={setDate}
        autoCapitalize="none"
      />
      <Button
        label="Find slots"
        disabled={!/^\d{4}-\d{2}-\d{2}$/.test(date)}
        onPress={() => setSelectedDate(date)}
      />
      <State
        loading={!!selectedDate && query.isLoading}
        error={query.error}
        empty={query.data?.length === 0}
        retry={() => void query.refetch()}
      />
      {query.data?.map((slot) => (
        <Card key={slot.id}>
          <Copy>
            {slotTime(slot.startAt, branch.timezone)} —{" "}
            {slotTime(slot.endAt, branch.timezone)}
          </Copy>
          <Copy>{slot.available} places available</Copy>
          <Button
            label={
              slot.available > 0 && slot.status === "AVAILABLE"
                ? "Select slot"
                : "Unavailable"
            }
            disabled={slot.available <= 0 || slot.status !== "AVAILABLE"}
            onPress={() =>
              navigation.navigate("Review", { ...route.params, slot })
            }
          />
        </Card>
      ))}
    </Screen>
  );
}
