import { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { randomUUID } from "expo-crypto";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStack } from "../../navigation/types";
import {
  Badge,
  Button,
  Card,
  Chip,
  Copy,
  Screen,
  SectionTitle,
  State,
  Title,
  palette,
} from "../../components/ui";
import { useSession } from "../../store/session";
import { money } from "../../utils/domain";

export function FlexScreen({
  navigation,
}: NativeStackScreenProps<RootStack, "Flex">) {
  const { api } = useSession();
  const cache = useQueryClient();
  const [planId, setPlanId] = useState("");
  const [primaryCityId, setPrimaryCityId] = useState("");
  const [secondaryCityId, setSecondaryCityId] = useState("");
  const purchaseKey = useMemo(
    () => randomUUID(),
    [planId, primaryCityId, secondaryCityId],
  );
  const subscription = useQuery({
    queryKey: ["flex-subscription"],
    queryFn: api.flexSubscription,
  });
  const plans = useQuery({ queryKey: ["flex-plans"], queryFn: api.flexPlans });
  const cities = useQuery({
    queryKey: ["flex-cities"],
    queryFn: api.flexCities,
  });
  const gyms = useQuery({
    queryKey: ["flex-gyms", subscription.data?.id],
    enabled: subscription.data?.status === "ACTIVE",
    queryFn: () => api.flexGyms(),
  });
  const purchase = useMutation({
    mutationFn: () =>
      api.purchaseFlex(
        {
          planId,
          primaryCityId,
          ...(secondaryCityId ? { secondaryCityId } : {}),
        },
        purchaseKey,
      ),
    onSuccess: async (checkout) => {
      if (checkout.simulated) await api.simulateFlexPayment(checkout.paymentId);
      await cache.invalidateQueries({ queryKey: ["flex-subscription"] });
      await cache.invalidateQueries({ queryKey: ["flex-gyms"] });
    },
  });
  const active = subscription.data?.status === "ACTIVE";
  const period = subscription.data?.periods[0];
  return (
    <Screen>
      <Title>One membership, two cities.</Title>
      <Copy>
        Flex is prepaid. Each eligible booking reserves one visit; the visit is
        consumed only at verified check-in.
      </Copy>
      <State
        loading={subscription.isLoading || plans.isLoading || cities.isLoading}
        error={
          subscription.error || plans.error || cities.error || purchase.error
        }
        retry={() => void subscription.refetch()}
      />
      {active && subscription.data ? (
        <>
          <View style={local.membership}>
            <View style={local.membershipTop}>
              <Badge label="ACTIVE MEMBERSHIP" tone="success" />
              <Text style={local.mark}>GR ↗</Text>
            </View>
            <Text style={local.plan}>{subscription.data.planName}</Text>
            <Text style={local.cities}>
              {subscription.data.primaryCity.name}
              {subscription.data.secondaryCity
                ? ` + ${subscription.data.secondaryCity.name}`
                : ""}
            </Text>
            <View style={local.usage}>
              <View>
                <Text style={local.usageValue}>
                  {period?.totalLimit ?? subscription.data.totalUsageLimit}
                </Text>
                <Text style={local.usageLabel}>VISITS</Text>
              </View>
              <View>
                <Text style={local.usageValue}>
                  {subscription.data.expiresAt
                    ? new Date(subscription.data.expiresAt).toLocaleDateString(
                        "en-IN",
                        { day: "2-digit", month: "short" },
                      )
                    : "—"}
                </Text>
                <Text style={local.usageLabel}>VALID UNTIL</Text>
              </View>
            </View>
          </View>
          <SectionTitle>Eligible gyms</SectionTitle>
          <State
            loading={gyms.isLoading}
            error={gyms.error}
            empty={gyms.data?.length === 0}
            retry={() => void gyms.refetch()}
          />
          {gyms.data?.map((item) => (
            <Card key={item.id}>
              <SectionTitle>{item.gym.name}</SectionTitle>
              <Copy>
                {item.branch.name} · {item.serviceCity.name}
              </Copy>
              <Button
                label="Choose a Flex slot"
                onPress={() =>
                  navigation.navigate("Gym", {
                    gymId: item.gym.id,
                    flexMode: true,
                    flexBranchId: item.branch.id,
                  })
                }
              />
            </Card>
          ))}
        </>
      ) : (
        <>
          <SectionTitle>Choose a plan</SectionTitle>
          {plans.data?.map((plan) => (
            <Card
              key={plan.id}
              tone={planId === plan.id ? "highlight" : "default"}
            >
              <SectionTitle>{plan.name}</SectionTitle>
              <Copy>
                {money(plan.priceMinor, plan.currency)} · {plan.totalUsageLimit}{" "}
                visits · {plan.durationDays} days
              </Copy>
              <Button
                label={
                  planId === plan.id ? "Selected plan" : `Choose ${plan.name}`
                }
                onPress={() => setPlanId(plan.id)}
              />
            </Card>
          ))}
          <SectionTitle>Primary city</SectionTitle>
          <View style={local.chips}>
            {cities.data?.map((city) => (
              <Chip
                key={`p-${city.id}`}
                label={`${city.name}, ${city.state}`}
                selected={primaryCityId === city.id}
                onPress={() => {
                  setPrimaryCityId(city.id);
                  if (secondaryCityId === city.id) setSecondaryCityId("");
                }}
              />
            ))}
          </View>
          <SectionTitle>Optional second city</SectionTitle>
          <View style={local.chips}>
            <Chip
              label="No second city"
              selected={!secondaryCityId}
              onPress={() => setSecondaryCityId("")}
            />
            {cities.data
              ?.filter((city) => city.id !== primaryCityId)
              .map((city) => (
                <Chip
                  key={`s-${city.id}`}
                  label={`${city.name}, ${city.state}`}
                  selected={secondaryCityId === city.id}
                  onPress={() => setSecondaryCityId(city.id)}
                />
              ))}
          </View>
          <Button
            label="Purchase Flex"
            disabled={!planId || !primaryCityId || purchase.isPending}
            onPress={() => purchase.mutate()}
          />
          <Copy>
            Development payment simulation is clearly marked and is never used
            when a real provider is configured.
          </Copy>
        </>
      )}
    </Screen>
  );
}

const local = StyleSheet.create({
  membership: {
    padding: 22,
    borderRadius: 26,
    backgroundColor: palette.ink,
    gap: 9,
    overflow: "hidden",
  },
  membershipTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  mark: { color: palette.lime, fontWeight: "900", fontSize: 18 },
  plan: {
    color: "#FFFFFF",
    fontSize: 28,
    lineHeight: 34,
    fontWeight: "900",
    letterSpacing: -0.7,
    marginTop: 12,
  },
  cities: { color: "#BFD0C6", fontSize: 15 },
  usage: {
    flexDirection: "row",
    gap: 38,
    borderTopWidth: 1,
    borderTopColor: "#355046",
    paddingTop: 16,
    marginTop: 8,
  },
  usageValue: { color: palette.lime, fontWeight: "900", fontSize: 20 },
  usageLabel: {
    color: "#9EB2A8",
    fontSize: 10,
    letterSpacing: 1.1,
    fontWeight: "700",
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
});
