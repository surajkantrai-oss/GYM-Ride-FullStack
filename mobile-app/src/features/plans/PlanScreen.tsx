import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStack } from "../../navigation/types";
import { Button, Copy, Screen, Title } from "../../components/ui";
import { money } from "../../utils/domain";
export function PlanScreen({
  route,
  navigation,
}: NativeStackScreenProps<RootStack, "Plan">) {
  const { gym, branch, plan } = route.params;
  return (
    <Screen>
      <Copy>
        {gym.name} · {branch.name}
      </Copy>
      <Title>{plan.name}</Title>
      <Title>{money(plan.priceMinor, plan.currency)}</Title>
      <Copy>{plan.description || plan.type.replaceAll("_", " ")}</Copy>
      <Copy>
        {plan.durationDays} day validity
        {plan.visitLimit ? ` · ${plan.visitLimit} visits` : ""}
      </Copy>
      <Button
        label={
          plan.type === "DAY_PASS"
            ? "Choose a date and slot"
            : "Review membership"
        }
        disabled={plan.status !== "ACTIVE"}
        onPress={() =>
          plan.type === "DAY_PASS"
            ? navigation.navigate("Slots", route.params)
            : navigation.navigate("Review", route.params)
        }
      />
    </Screen>
  );
}
