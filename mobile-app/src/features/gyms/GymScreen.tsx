import { useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
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
import { gymVisual } from "../../components/gym-visuals";
import { colors } from "../../components/theme";
import { useSession } from "../../store/session";
import { money } from "../../utils/domain";
export function GymScreen({
  route,
  navigation,
}: NativeStackScreenProps<RootStack, "Gym">) {
  const { api } = useSession();
  const [branchId, setBranchId] = useState<string | null>(null);
  const gym = useQuery({
    queryKey: ["gym", route.params.gymId],
    queryFn: () => api.gym(route.params.gymId),
  });
  const reviews = useQuery({
    queryKey: ["gym-reviews", route.params.gymId, "preview"],
    queryFn: () => api.gymReviews(route.params.gymId, 1),
  });
  const plans = useQuery({
    queryKey: ["plans", branchId],
    enabled: !!branchId,
    queryFn: () => api.plans(branchId!),
  });
  const branch = gym.data?.branches.find((b) => b.id === branchId);
  const flexMode = route.params.flexMode === true;
  const visibleBranches =
    flexMode && route.params.flexBranchId
      ? gym.data?.branches.filter((b) => b.id === route.params.flexBranchId)
      : gym.data?.branches;
  return (
    <Screen>
      <State
        loading={gym.isLoading}
        error={gym.error}
        retry={() => void gym.refetch()}
      />
      {gym.data && (
        <>
          <View style={local.heroWrap}>
            <Image source={gymVisual(gym.data.id)} style={local.hero} />
            <View style={local.heroShade} />
            <View style={local.heroBadge}>
              <Badge
                label={flexMode ? "Flex eligible" : "GYMRide verified"}
                tone="success"
              />
            </View>
          </View>
          <Title>{gym.data.name}</Title>
          <View style={local.meta}>
            <Text style={local.rating}>
              ★{" "}
              {gym.data.averageRating == null
                ? "New"
                : gym.data.averageRating.toFixed(1)}
            </Text>
            <Text style={local.metaText}>
              {gym.data.reviewCount || 0} reviews
            </Text>
            <Text style={local.metaText}>
              {gym.data.branches.length} branches
            </Text>
          </View>
          <View style={local.tabs}>
            <Text style={local.tabActive}>Overview</Text>
            <Text style={local.tab}>Branches</Text>
            <Text style={local.tab}>Reviews</Text>
            <Text style={local.tab}>About</Text>
          </View>
          <Copy>
            {gym.data.description || "Make this your next training space."}
          </Copy>
          <State
            loading={reviews.isLoading}
            error={reviews.error}
            retry={() => void reviews.refetch()}
          />
          {reviews.data?.data.slice(0, 2).map((review) => (
            <Card key={review.id}>
              <Copy>
                {"★".repeat(review.rating)} · {review.reviewerName}
              </Copy>
              {review.comment && <Copy>{review.comment}</Copy>}
            </Card>
          ))}
          <Button
            variant="secondary"
            label="See all reviews"
            onPress={() =>
              navigation.navigate("GymReviews", { gymId: route.params.gymId })
            }
          />
          <SectionTitle>Choose a branch</SectionTitle>
          {flexMode && (
            <Copy>
              Flex booking · your visit is covered by your active subscription.
            </Copy>
          )}
          <View style={local.chips}>
            {visibleBranches?.map((b) => (
              <Chip
                key={b.id}
                label={`${b.name} · ${b.city}`}
                selected={branchId === b.id}
                onPress={() => setBranchId(b.id)}
              />
            ))}
          </View>
          {branch && (
            <>
              <Card>
                <SectionTitle>{branch.name}</SectionTitle>
                <Copy>
                  {branch.address}, {branch.city}, {branch.state}{" "}
                  {branch.postalCode}
                </Copy>
                <View style={local.chips}>
                  {branch.amenities?.map((a) => {
                    const amenity = "amenity" in a ? a.amenity.name : a.name;
                    return <Chip key={amenity} label={amenity} />;
                  })}
                </View>
                <Copy>
                  {branch.operatingHours?.filter((h) => !h.isClosed).length ||
                    0}{" "}
                  operating days · {branch.timezone}
                </Copy>
              </Card>
              <Button
                label={`Reviews for ${branch.name}`}
                onPress={() =>
                  navigation.navigate("GymReviews", {
                    gymId: route.params.gymId,
                    branchId: branch.id,
                  })
                }
              />
              <SectionTitle>Plans & passes</SectionTitle>
              <State
                loading={plans.isLoading}
                error={plans.error}
                empty={plans.data?.length === 0}
                retry={() => void plans.refetch()}
              />
              {plans.data
                ?.filter((p) => p.status === "ACTIVE")
                .map((plan) => (
                  <Card key={plan.id}>
                    <SectionTitle>{plan.name}</SectionTitle>
                    <Copy>
                      {money(plan.priceMinor, plan.currency)} ·{" "}
                      {plan.type.replaceAll("_", " ")}
                    </Copy>
                    <Button
                      label={`Choose ${plan.name}`}
                      onPress={() =>
                        navigation.navigate("Plan", {
                          gym: gym.data!,
                          branch,
                          plan,
                          flexMode,
                        })
                      }
                    />
                  </Card>
                ))}
            </>
          )}
        </>
      )}
    </Screen>
  );
}

const local = StyleSheet.create({
  heroWrap: {
    height: 270,
    borderRadius: 28,
    overflow: "hidden",
    backgroundColor: palette.ink,
    position: "relative",
  },
  hero: { width: "100%", height: "100%" },
  heroShade: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(7,35,25,.12)",
  },
  heroBadge: { position: "absolute", left: 16, bottom: 16 },
  meta: { flexDirection: "row", alignItems: "center", gap: 12 },
  rating: { color: palette.warning, fontWeight: "800", fontSize: 15 },
  metaText: {
    color: "#E0EEE7",
    fontSize: 13,
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  tabs: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  tab: {
    paddingVertical: 12,
    color: "#E0EEE7",
    fontSize: 13,
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  tabActive: {
    paddingVertical: 12,
    color: colors.primaryMuted,
    fontWeight: "800",
    borderBottomWidth: 2,
    borderBottomColor: colors.primaryMuted,
    fontSize: 13,
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
});
