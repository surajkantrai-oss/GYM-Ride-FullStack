import { useMemo, useState } from "react";
import { randomUUID } from "expo-crypto";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStack } from "../../navigation/types";
import { Button, Card, Copy, Screen, State, Title } from "../../components/ui";
import { useSession } from "../../store/session";
import { money } from "../../utils/domain";

export function FlexScreen({ navigation }: NativeStackScreenProps<RootStack, "Flex">) {
  const { api } = useSession();
  const cache = useQueryClient();
  const [planId, setPlanId] = useState("");
  const [primaryCityId, setPrimaryCityId] = useState("");
  const [secondaryCityId, setSecondaryCityId] = useState("");
  const purchaseKey = useMemo(() => randomUUID(), [planId, primaryCityId, secondaryCityId]);
  const subscription = useQuery({ queryKey: ["flex-subscription"], queryFn: api.flexSubscription });
  const plans = useQuery({ queryKey: ["flex-plans"], queryFn: api.flexPlans });
  const cities = useQuery({ queryKey: ["flex-cities"], queryFn: api.flexCities });
  const gyms = useQuery({ queryKey: ["flex-gyms", subscription.data?.id], enabled: subscription.data?.status === "ACTIVE", queryFn: () => api.flexGyms() });
  const purchase = useMutation({
    mutationFn: () => api.purchaseFlex({ planId, primaryCityId, ...(secondaryCityId ? { secondaryCityId } : {}) }, purchaseKey),
    onSuccess: async (checkout) => {
      if (checkout.simulated) await api.simulateFlexPayment(checkout.paymentId);
      await cache.invalidateQueries({ queryKey: ["flex-subscription"] });
      await cache.invalidateQueries({ queryKey: ["flex-gyms"] });
    },
  });
  const active = subscription.data?.status === "ACTIVE";
  const period = subscription.data?.periods[0];
  return <Screen>
    <Title>One membership, two cities.</Title>
    <Copy>Flex is prepaid. Each eligible booking reserves one visit; the visit is consumed only at verified check-in.</Copy>
    <State loading={subscription.isLoading || plans.isLoading || cities.isLoading} error={subscription.error || plans.error || cities.error || purchase.error} retry={() => void subscription.refetch()} />
    {active && subscription.data ? <>
      <Card>
        <Title>{subscription.data.planName}</Title>
        <Copy>{subscription.data.primaryCity.name}{subscription.data.secondaryCity ? ` + ${subscription.data.secondaryCity.name}` : ""}</Copy>
        <Copy>{period?.totalLimit ?? subscription.data.totalUsageLimit} visits · expires {subscription.data.expiresAt ? new Date(subscription.data.expiresAt).toLocaleDateString("en-IN") : "—"}</Copy>
      </Card>
      <Title>Eligible gyms</Title>
      <State loading={gyms.isLoading} error={gyms.error} empty={gyms.data?.length === 0} retry={() => void gyms.refetch()} />
      {gyms.data?.map((item) => <Card key={item.id}>
        <Title>{item.gym.name}</Title><Copy>{item.branch.name} · {item.serviceCity.name}</Copy>
        <Button label="Choose a Flex slot" onPress={() => navigation.navigate("Gym", { gymId: item.gym.id, flexMode: true, flexBranchId: item.branch.id })} />
      </Card>)}
    </> : <>
      <Title>Choose a plan</Title>
      {plans.data?.map((plan) => <Card key={plan.id}><Title>{plan.name}</Title><Copy>{money(plan.priceMinor, plan.currency)} · {plan.totalUsageLimit} visits · {plan.durationDays} days</Copy><Button label={planId === plan.id ? "Selected plan" : `Choose ${plan.name}`} onPress={() => setPlanId(plan.id)} /></Card>)}
      <Title>Primary city</Title>
      {cities.data?.map((city) => <Button key={`p-${city.id}`} label={`${primaryCityId === city.id ? "Selected: " : ""}${city.name}, ${city.state}`} onPress={() => { setPrimaryCityId(city.id); if (secondaryCityId === city.id) setSecondaryCityId(""); }} />)}
      <Title>Optional second city</Title>
      <Button label="No second city" onPress={() => setSecondaryCityId("")} />
      {cities.data?.filter((city) => city.id !== primaryCityId).map((city) => <Button key={`s-${city.id}`} label={`${secondaryCityId === city.id ? "Selected: " : ""}${city.name}, ${city.state}`} onPress={() => setSecondaryCityId(city.id)} />)}
      <Button label="Purchase Flex" disabled={!planId || !primaryCityId || purchase.isPending} onPress={() => purchase.mutate()} />
      <Copy>Development payment simulation is clearly marked and is never used when a real provider is configured.</Copy>
    </>}
  </Screen>;
}
