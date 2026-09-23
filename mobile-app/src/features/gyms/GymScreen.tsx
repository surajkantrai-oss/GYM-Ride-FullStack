import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStack } from "../../navigation/types";
import { Button, Card, Copy, Screen, State, Title } from "../../components/ui";
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
  const visibleBranches = flexMode && route.params.flexBranchId
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
          <Title>{gym.data.name}</Title>
          <Copy>
            {gym.data.description || "Make this your next training space."}
          </Copy>
          <Copy>{gym.data.averageRating == null ? "No ratings yet" : `${gym.data.averageRating.toFixed(1)} / 5` } · {gym.data.reviewCount || 0} reviews</Copy>
          <State loading={reviews.isLoading} error={reviews.error} retry={() => void reviews.refetch()} />
          {reviews.data?.data.slice(0, 2).map((review) => <Card key={review.id}>
            <Copy>{"★".repeat(review.rating)} · {review.reviewerName}</Copy>
            {review.comment && <Copy>{review.comment}</Copy>}
          </Card>)}
          <Button label="See all reviews" onPress={() => navigation.navigate("GymReviews", { gymId: route.params.gymId })} />
          <Title>Choose a branch</Title>
          {flexMode && <Copy>Flex booking · your visit is covered by your active subscription.</Copy>}
          {visibleBranches?.map((b) => (
            <Button
              key={b.id}
              label={`${branchId === b.id ? "Selected: " : ""}${b.name} · ${b.city}`}
              onPress={() => setBranchId(b.id)}
            />
          ))}
          {branch && (
            <>
              <Card>
                <Title>{branch.name}</Title>
                <Copy>
                  {branch.address}, {branch.city}, {branch.state}{" "}
                  {branch.postalCode}
                </Copy>
                <Copy>
                  {branch.amenities
                    ?.map((a) => ("amenity" in a ? a.amenity.name : a.name))
                    .join(" · ")}
                </Copy>
                {branch.operatingHours?.map((h, i) => (
                  <Copy key={i}>
                    {h.weekday}:{" "}
                    {h.isClosed
                      ? "Closed"
                      : `${h.opensAt?.slice(11, 16)}–${h.closesAt?.slice(11, 16)}`}{" "}
                    ({branch.timezone})
                  </Copy>
                ))}
              </Card>
              <Button label={`Reviews for ${branch.name}`} onPress={() => navigation.navigate("GymReviews", { gymId: route.params.gymId, branchId: branch.id })} />
              <Title>Plans</Title>
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
                    <Title>{plan.name}</Title>
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
