import { useQuery } from "@tanstack/react-query";
import {
  ImageBackground,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStack } from "../../navigation/types";
import {
  Badge,
  Button,
  Card,
  Copy,
  GymCard,
  Screen,
  SectionTitle,
  State,
  palette,
} from "../../components/ui";
import { gymVisual, heroVisual } from "../../components/gym-visuals";
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
    queryFn: () =>
      api.recommendations(
        new URLSearchParams({
          ...(location.coordinates && {
            latitude: String(location.coordinates.latitude),
            longitude: String(location.coordinates.longitude),
          }),
          radiusKm: "10",
          page: "1",
          limit: "5",
        }).toString(),
      ),
  });
  const bookings = useQuery({
    queryKey: ["bookings", 1],
    queryFn: () => api.bookings(1),
  });
  const unread = useQuery({
    queryKey: ["unread-count"],
    queryFn: () => api.unreadCount(),
    refetchInterval: 60_000,
  });
  return (
    <Screen>
      <View style={local.header}>
        <View>
          <Text style={local.brand}>GR GYMRide</Text>
          <Text style={local.brandNote}>Find. Fit. Belong.</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Notifications"
          onPress={() => navigation.navigate("Notifications")}
          style={local.notification}
        >
          <Text style={local.notificationText}>●</Text>
          {unread.data?.count ? (
            <View style={local.unread}>
              <Text style={local.unreadText}>{unread.data.count}</Text>
            </View>
          ) : null}
        </Pressable>
      </View>
      <ImageBackground
        source={heroVisual}
        imageStyle={local.heroImage}
        style={local.hero}
      >
        <View style={local.heroScrim} />
        <View style={local.heroCopy}>
          <Badge
            label={`Good morning, ${user?.firstName || "athlete"}`}
            tone="success"
          />
          <Text style={local.heroTitle}>
            A good day{`\n`}starts with{`\n`}a workout.
          </Text>
          <Text style={local.heroBody}>
            Discover a place that makes you feel stronger.
          </Text>
        </View>
      </ImageBackground>
      <Pressable
        accessibilityRole="button"
        onPress={() => navigation.navigate("Main", { screen: "Explore" })}
        style={local.search}
      >
        <Text style={local.searchIcon}>⌕</Text>
        <Text style={local.searchText}>Search gyms, areas or cities…</Text>
      </Pressable>
      <View style={local.quickRow}>
        <Pressable style={local.quick} onPress={() => void location.locate()}>
          <Text style={local.quickIcon}>⌖</Text>
          <Text style={local.quickLabel}>Near me</Text>
        </Pressable>
        <Pressable
          style={local.quick}
          onPress={() => navigation.navigate("Main", { screen: "Explore" })}
        >
          <Text style={local.quickIcon}>★</Text>
          <Text style={local.quickLabel}>Top rated</Text>
        </Pressable>
        <Pressable
          style={local.quick}
          onPress={() => navigation.navigate("Flex")}
        >
          <Text style={local.quickIcon}>↗</Text>
          <Text style={local.quickLabel}>Flex</Text>
        </Pressable>
        <Pressable
          style={local.quick}
          onPress={() => navigation.navigate("GymPreferences")}
        >
          <Text style={local.quickIcon}>☷</Text>
          <Text style={local.quickLabel}>Preferences</Text>
        </Pressable>
      </View>
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
          <SectionTitle>Nearby gyms</SectionTitle>
          <State
            loading={nearby.isLoading}
            error={nearby.error}
            empty={nearby.data?.data.length === 0}
            retry={() => void nearby.refetch()}
          />
          {nearby.data?.data.map((gym) => (
            <GymCard
              key={gym.branch.id}
              name={gym.gymName}
              meta={`${gym.branch.name} · ${(gym.distanceMeters / 1000).toFixed(1)} km`}
              detail="Near you"
              image={gymVisual(gym.gymId)}
              onPress={() => navigation.navigate("Gym", { gymId: gym.gymId })}
            />
          ))}
        </>
      )}
      <SectionTitle>Recommended for you</SectionTitle>
      <State
        loading={recommendations.isLoading}
        error={recommendations.error}
        empty={recommendations.data?.data.length === 0}
        retry={() => void recommendations.refetch()}
      />
      {recommendations.data?.data.map((item) => (
        <GymCard
          key={item.branch.id}
          name={item.gym.name}
          meta={`${item.branch.name} · ${item.branch.city}${item.distanceMeters == null ? "" : ` · ${(item.distanceMeters / 1000).toFixed(1)} km`}`}
          detail={`${item.reasons.map((reason) => recommendationReasonLabel[reason]).join(" · ") || "Recommended for you"} · From ₹${(item.startingPriceMinor / 100).toFixed(0)}`}
          image={gymVisual(item.gym.id)}
          onPress={() => navigation.navigate("Gym", { gymId: item.gym.id })}
        />
      ))}
      <SectionTitle>Your bookings</SectionTitle>
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
      <SectionTitle>Discover gyms</SectionTitle>
      <State
        loading={query.isLoading}
        error={query.error}
        empty={query.data?.data.length === 0}
        retry={() => void query.refetch()}
      />
      {query.data?.data.map((gym) => (
        <GymCard
          key={gym.id}
          name={gym.name}
          meta={
            gym.branches?.[0]
              ? `${gym.branches[0].name} · ${gym.branches[0].city}`
              : "Explore available branches"
          }
          detail={gym.description || "Plans and availability"}
          image={gymVisual(gym.id)}
          onPress={() => navigation.navigate("Gym", { gymId: gym.id })}
        />
      ))}
    </Screen>
  );
}

const local = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 2,
  },
  brand: { fontSize: 18, fontWeight: "900", color: palette.ink },
  brandNote: { fontSize: 10, color: palette.muted, marginLeft: 30 },
  notification: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    alignItems: "center",
    justifyContent: "center",
  },
  notificationText: { color: palette.accent, fontSize: 16 },
  unread: {
    position: "absolute",
    right: -2,
    top: -2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: palette.lime,
    alignItems: "center",
    justifyContent: "center",
  },
  unreadText: { fontSize: 10, fontWeight: "800", color: palette.ink },
  hero: {
    height: 330,
    justifyContent: "flex-end",
    overflow: "hidden",
    borderRadius: 28,
    backgroundColor: palette.ink,
  },
  heroImage: { borderRadius: 28 },
  heroScrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(6,27,20,.42)",
  },
  heroCopy: { padding: 22, gap: 10 },
  heroTitle: {
    fontSize: 39,
    lineHeight: 40,
    fontWeight: "900",
    letterSpacing: -1.1,
    color: "#FFFFFF",
  },
  heroBody: { maxWidth: 240, color: "#E7EFEA", fontSize: 15, lineHeight: 21 },
  search: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 17,
    borderRadius: 16,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    shadowColor: "#173328",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.07,
    shadowRadius: 14,
    elevation: 2,
  },
  searchIcon: { fontSize: 21, color: palette.accent },
  searchText: { fontSize: 15, color: palette.muted },
  quickRow: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  quick: { flex: 1, alignItems: "center", gap: 6 },
  quickIcon: {
    width: 44,
    height: 44,
    textAlign: "center",
    textAlignVertical: "center",
    paddingTop: 10,
    borderRadius: 15,
    overflow: "hidden",
    backgroundColor: palette.accentSoft,
    color: palette.accent,
    fontSize: 18,
    fontWeight: "800",
  },
  quickLabel: {
    fontSize: 10,
    color: palette.ink,
    fontWeight: "700",
    textAlign: "center",
  },
});
