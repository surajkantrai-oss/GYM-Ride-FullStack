import { useQuery } from "@tanstack/react-query";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStack } from "../../navigation/types";
import {
  Button,
  Card,
  Copy,
  GymCard,
  SectionTitle,
  State,
} from "../../components/ui";
import { AppIcon } from "../../components/AppIcon";
import { BrandLockup, GymBackground } from "../../components/app-backgrounds";
import { QuickAction, SearchBar } from "../../components/home-controls";
import { colors, radius, shadows, spacing, typography } from "../../components/theme";
import { gymVisual } from "../../components/gym-visuals";
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
  const city = recommendations.data?.data[0]?.branch.city ?? query.data?.data[0]?.branches?.[0]?.city ?? "Choose location";
  return (
    <GymBackground overlay={0.48}>
      <SafeAreaView edges={["top", "left", "right"]} style={local.safe}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={local.content}>
          <View style={local.header}>
            <View style={local.greeting}>
              <Text style={local.hello}>Hello,</Text>
              <View style={local.nameRow}>
                <Text numberOfLines={1} style={local.name}>{user?.firstName || "Athlete"}</Text>
                <AppIcon name="spark" size={21} color="#A9E8CB" filled />
              </View>
              <Text style={local.tagline}>Find. Fit. Belong.</Text>
            </View>
            <BrandLockup light compact />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Notifications"
              onPress={() => navigation.navigate("Notifications")}
              style={local.notification}
            >
              <AppIcon name="bell" size={23} color={colors.textSecondary} filled />
              {unread.data?.count ? <View style={local.unread} /> : null}
            </Pressable>
          </View>
          <View style={local.heroCopy}>
            <Text style={local.heroTitle}>Find your gym.{`\n`}<Text style={local.heroAccent}>Train your way.</Text></Text>
            <Text style={local.heroBody}>Discover gyms, compare amenities,{`\n`}and book in minutes.</Text>
          </View>
          <SearchBar label="Search gyms, areas or amenities…" onPress={() => navigation.navigate("Main", { screen: "Explore" })} />
          <View style={local.quickRow}>
            <QuickAction icon="location" label="Near me" onPress={() => void location.locate()} />
            <QuickAction icon="star" label="Top rated" onPress={() => navigation.navigate("Main", { screen: "Explore" })} />
            <QuickAction icon="dumbbell" label="Flex" onPress={() => navigation.navigate("Flex")} />
            <QuickAction icon="sliders" label="Preferences" onPress={() => navigation.navigate("GymPreferences")} />
          </View>
          <View style={local.sectionHeading}>
            <View style={local.sectionHeadingCopy}>
              <Text accessibilityRole="header" style={local.sectionTitle}>Recommended for you</Text>
              <Text style={local.sectionSubtitle}>Gyms picked based on your location and preferences.</Text>
            </View>
            <Pressable accessibilityRole="button" onPress={() => navigation.navigate("Main", { screen: "Explore" })} style={local.seeAll}>
              <Text style={local.seeAllText}>See all  →</Text>
            </Pressable>
          </View>
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
              tag={item.reasons.length ? recommendationReasonLabel[item.reasons[0]!] : "Picked for you"}
              amenities={item.amenities.length ? item.amenities : item.planTypes.map((type) => type.replaceAll("_", " "))}
              rating={item.averageRating}
              reviewCount={item.reviewCount}
              status={item.availability.availableSlots ? `${item.availability.availableSlots} slots available` : "Check availability"}
              price={`From ₹${(item.startingPriceMinor / 100).toFixed(0)}`}
              image={gymVisual(item.gym.id)}
              onPress={() => navigation.navigate("Gym", { gymId: item.gym.id })}
            />
          ))}

          {location.coordinates && (
            <View style={local.lowerSurface}>
              <SectionTitle>Nearby gyms</SectionTitle>
              <State loading={nearby.isLoading} error={nearby.error} empty={nearby.data?.data.length === 0} retry={() => void nearby.refetch()} />
              {nearby.data?.data.map((gym) => (
                <GymCard key={gym.branch.id} name={gym.gymName} meta={`${gym.branch.name} · ${(gym.distanceMeters / 1000).toFixed(1)} km`} detail="Near you" image={gymVisual(gym.gymId)} onPress={() => navigation.navigate("Gym", { gymId: gym.gymId })} />
              ))}
            </View>
          )}
          {!["denied", "restricted", "unavailable"].includes(location.status) ? null : (
            <View style={local.infoCard}><Copy>Location unavailable. Search {city} or another city in Explore.</Copy></View>
          )}
          <View style={local.lowerSurface}>
            <SectionTitle>Your bookings</SectionTitle>
            <State loading={bookings.isLoading} error={bookings.error} empty={bookings.data?.data.filter((b) => ["CONFIRMED", "PAYMENT_PENDING"].includes(b.status)).length === 0} retry={() => void bookings.refetch()} />
            {bookings.data?.data.filter((b) => ["CONFIRMED", "PAYMENT_PENDING"].includes(b.status)).slice(0, 2).map((b) => (
              <Card key={b.id}><Copy>{b.gym.name} · {b.status.replaceAll("_", " ")}</Copy><Button label="View booking" onPress={() => navigation.navigate("Booking", { bookingId: b.id })} /></Card>
            ))}
            <SectionTitle>Discover gyms</SectionTitle>
            <State loading={query.isLoading} error={query.error} empty={query.data?.data.length === 0} retry={() => void query.refetch()} />
            {query.data?.data.map((gym) => (
              <GymCard key={gym.id} name={gym.name} meta={gym.branches?.[0] ? `${gym.branches[0].name} · ${gym.branches[0].city}` : "Explore available branches"} detail={gym.description || "Plans and availability"} image={gymVisual(gym.id)} onPress={() => navigation.navigate("Gym", { gymId: gym.id })} />
            ))}
          </View>
        </ScrollView>
      </SafeAreaView>
    </GymBackground>
  );
}

const local = StyleSheet.create({
  safe: { flex: 1 },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing["3xl"], gap: spacing.lg },
  header: { minHeight: 106, flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: spacing.sm },
  greeting: { flex: 1, paddingTop: spacing.sm },
  hello: { color: colors.white, fontSize: 15, lineHeight: 20 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  name: { color: colors.white, fontSize: 24, lineHeight: 29, fontWeight: "900" },
  tagline: { color: "#E4EEE9", fontSize: 13, lineHeight: 18, marginTop: 2 },
  notification: { width: 48, height: 48, marginTop: spacing.sm, borderRadius: 24, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,253,248,0.92)" },
  unread: { position: "absolute", right: 2, top: 1, width: 10, height: 10, borderRadius: 5, backgroundColor: "#E7433D", borderWidth: 2, borderColor: colors.white },
  heroCopy: { minHeight: 208, justifyContent: "flex-end", paddingBottom: spacing.sm },
  heroTitle: { ...typography.display, color: colors.white, fontSize: 41, lineHeight: 44 },
  heroAccent: { color: "#A9E8CB" },
  heroBody: { marginTop: spacing.md, maxWidth: 310, color: colors.white, ...typography.body },
  quickRow: { flexDirection: "row", justifyContent: "space-between", gap: spacing.sm },
  sectionHeading: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: spacing.sm, marginTop: spacing.sm },
  sectionHeadingCopy: { flex: 1 },
  sectionTitle: { ...typography.heading2, color: colors.white },
  sectionSubtitle: { ...typography.caption, color: "#E1EAE5", marginTop: 2 },
  seeAll: { minHeight: 42, justifyContent: "center", borderRadius: radius.round, paddingHorizontal: spacing.md, backgroundColor: "rgba(255,253,248,0.2)" },
  seeAllText: { ...typography.label, color: colors.white },
  lowerSurface: { gap: spacing.md, borderRadius: radius.largeCard, padding: spacing.lg, backgroundColor: "rgba(255,253,248,0.96)", ...shadows.card },
  infoCard: { borderRadius: radius.input, padding: spacing.md, backgroundColor: "rgba(255,253,248,0.94)" },
});
