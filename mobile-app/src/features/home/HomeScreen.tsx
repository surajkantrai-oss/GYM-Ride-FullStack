import { useQuery } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStack } from "../../navigation/types";
import { Button, Card, Copy, Screen, State, Title } from "../../components/ui";
import { useSession } from "../../store/session";
import { useDiscoveryLocation } from "../discovery/useLocation";
import { recommendationReasonLabel } from "../recommendations/reasons";
export function HomeScreen() {
  const { api, user } = useSession();
  const navigation = useNavigation<NativeStackNavigationProp<RootStack>>();
  const location = useDiscoveryLocation();
  const nearby = useQuery({
    queryKey: ["home-nearby", location.coordinates],
    enabled: !!location.coordinates,
    queryFn: () =>
      api.nearby(
        new URLSearchParams({
          latitude: String(location.coordinates!.latitude),
          longitude: String(location.coordinates!.longitude),
          radiusKm: "10",
          limit: "5",
        }).toString(),
      ),
  });
  const query = useQuery({
    queryKey: ["home-gyms"],
    queryFn: () => api.gyms("page=1&limit=5"),
  });
  const recommendations = useQuery({
    queryKey: ["recommendations", "home", location.coordinates],
    queryFn: () => api.recommendations(new URLSearchParams({ ...(location.coordinates && { latitude: String(location.coordinates.latitude), longitude: String(location.coordinates.longitude) }), radiusKm: "10", page: "1", limit: "5" }).toString()),
  });
  const bookings = useQuery({
    queryKey: ["bookings", 1],
    queryFn: () => api.bookings(1),
  });
  const unread = useQuery({ queryKey: ["unread-count"], queryFn: () => api.unreadCount(), refetchInterval: 60_000 });
  return (
    <Screen>
      <Copy>Welcome, {user?.firstName || "athlete"}</Copy>
      <Title>A good day starts with a workout.</Title>
      <Button label={`Notifications${unread.data?.count ? ` (${unread.data.count} unread)` : ""}`} onPress={() => navigation.navigate("Notifications")} />
      <Button label="GYMRide Flex" onPress={() => navigation.navigate("Flex")} />
      <Button label="Recommendation preferences" onPress={() => navigation.navigate("GymPreferences")} />
      <Copy>
        Explore gyms and choose the branch and plan that suit you. Use Explore
        for nearby or city search.
      </Copy>
      <Button
        label="Search gyms and cities"
        onPress={() => navigation.navigate("Main", { screen: "Explore" })}
      />
      <Button
        label="Find gyms near me"
        disabled={location.status === "loading"}
        onPress={() => void location.locate()}
      />
      <Copy>
        {location.coordinates
          ? `Discovery location: ${location.coordinates.latitude.toFixed(2)}, ${location.coordinates.longitude.toFixed(2)}`
          : "Location is optional. Search a city to discover gyms without sharing GPS."}
      </Copy>
      {["denied", "restricted", "unavailable"].includes(location.status) && (
        <Copy>
          Location unavailable. City search remains available in Explore.
        </Copy>
      )}
      {location.coordinates && (
        <>
          <Title>Nearby gyms</Title>
          <State
            loading={nearby.isLoading}
            error={nearby.error}
            empty={nearby.data?.data.length === 0}
            retry={() => void nearby.refetch()}
          />
          {nearby.data?.data.map((gym) => (
            <Card key={gym.branch.id}>
              <Title>{gym.gymName}</Title>
              <Copy>
                {gym.branch.name} · {(gym.distanceMeters / 1000).toFixed(1)} km
              </Copy>
              <Button
                label={`View ${gym.gymName}`}
                onPress={() => navigation.navigate("Gym", { gymId: gym.gymId })}
              />
            </Card>
          ))}
        </>
      )}
      <Title>Recommended for You</Title>
      <State loading={recommendations.isLoading} error={recommendations.error} empty={recommendations.data?.data.length === 0} retry={() => void recommendations.refetch()} />
      {recommendations.data?.data.map((item) => <Card key={item.branch.id}>
        <Title>{item.gym.name}</Title><Copy>{item.branch.name} · {item.branch.city}{item.distanceMeters == null ? "" : ` · ${(item.distanceMeters / 1000).toFixed(1)} km`}</Copy>
        <Copy>{item.reasons.map((reason) => recommendationReasonLabel[reason]).join(" · ") || "Recommended from current availability"}</Copy>
        <Copy>From ₹{(item.startingPriceMinor / 100).toFixed(0)} · Score {item.score}/100</Copy>
        <Button label={`View ${item.gym.name}`} onPress={() => navigation.navigate("Gym", { gymId: item.gym.id })} />
      </Card>)}
      <Title>Your bookings</Title>
      <State
        loading={bookings.isLoading}
        error={bookings.error}
        empty={
          bookings.data?.data.filter((b) =>
            ["CONFIRMED", "PAYMENT_PENDING"].includes(b.status),
          ).length === 0
        }
        retry={() => void bookings.refetch()}
      />
      {bookings.data?.data
        .filter((b) => ["CONFIRMED", "PAYMENT_PENDING"].includes(b.status))
        .slice(0, 2)
        .map((b) => (
          <Card key={b.id}>
            <Copy>
              {b.gym.name} · {b.status.replaceAll("_", " ")}
            </Copy>
            <Button
              label="View booking"
              onPress={() =>
                navigation.navigate("Booking", { bookingId: b.id })
              }
            />
          </Card>
        ))}
      <Title>Discover gyms</Title>
      <State
        loading={query.isLoading}
        error={query.error}
        empty={query.data?.data.length === 0}
        retry={() => void query.refetch()}
      />
      {query.data?.data.map((gym) => (
        <Card key={gym.id}>
          <Title>{gym.name}</Title>
          <Copy>
            {gym.description ||
              "Choose a branch to explore plans and availability."}
          </Copy>
          <Button
            label={`Explore ${gym.name}`}
            onPress={() => navigation.navigate("Gym", { gymId: gym.id })}
          />
        </Card>
      ))}
    </Screen>
  );
}
