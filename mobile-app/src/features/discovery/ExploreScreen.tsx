import { useState } from "react";
import { FlatList, Linking, StyleSheet, View } from "react-native";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStack } from "../../navigation/types";
import {
  Button,
  Chip,
  Copy,
  GymCard,
  Input,
  Screen,
  SectionTitle,
  State,
} from "../../components/ui";
import { AppHeader } from "../../components/headers";
import { gymVisual } from "../../components/gym-visuals";
import { useSession } from "../../store/session";
import { useDiscoveryLocation } from "./useLocation";
import { recommendationReasonLabel } from "../recommendations/reasons";
export function ExploreScreen() {
  const { api } = useSession();
  const navigation = useNavigation<NativeStackNavigationProp<RootStack>>();
  const location = useDiscoveryLocation();
  const [search, setSearch] = useState("");
  const [city, setCity] = useState("");
  const [applied, setApplied] = useState({ search: "", city: "" });
  const [amenities, setAmenities] = useState("");
  const [radius, setRadius] = useState("10");
  const [filters, setFilters] = useState({
    state: "",
    amenities: "",
    radiusKm: "10",
  });
  const query = useInfiniteQuery({
    queryKey: ["discovery", applied, filters, location.coordinates],
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => {
      if (location.coordinates) {
        const data = await api.nearby(
          new URLSearchParams({
            latitude: String(location.coordinates.latitude),
            longitude: String(location.coordinates.longitude),
            radiusKm: filters.radiusKm,
            amenities: filters.amenities,
            page: String(pageParam),
            limit: "20",
          }).toString(),
        );
        return {
          rows: data.data.map((g) => ({
            id: g.branch.id,
            gymId: g.gymId,
            name: g.gymName,
            description: `${g.branch.name} · ${g.branch.city} · ${(g.distanceMeters / 1000).toFixed(1)} km`,
            amenities: g.amenities.join(" · "),
          })),
          next: data.meta.hasMore ? pageParam + 1 : undefined,
        };
      }
      const data = await api.gyms(
        new URLSearchParams({
          ...applied,
          state: filters.state,
          amenities: filters.amenities,
          page: String(pageParam),
          limit: "20",
        }).toString(),
      );
      return {
        rows: data.data.map((g) => ({
          id: g.id,
          gymId: g.id,
          name: g.name,
          description: g.branches
            .map((b) => `${b.name}, ${b.city}`)
            .join(" · "),
          amenities: "",
        })),
        next: data.meta.hasNextPage ? pageParam + 1 : undefined,
      };
    },
    getNextPageParam: (last) => last.next,
  });
  const recommended = useInfiniteQuery({
    queryKey: [
      "recommendations",
      "explore",
      applied,
      filters,
      location.coordinates,
    ],
    initialPageParam: 1,
    queryFn: async ({ pageParam }) =>
      api.recommendations(
        new URLSearchParams({
          ...(location.coordinates
            ? {
                latitude: String(location.coordinates.latitude),
                longitude: String(location.coordinates.longitude),
              }
            : applied.city
              ? { city: applied.city }
              : {}),
          radiusKm: filters.radiusKm,
          amenities: filters.amenities,
          page: String(pageParam),
          limit: "10",
        }).toString(),
      ),
    getNextPageParam: (last) =>
      last.meta.hasNextPage ? last.meta.page + 1 : undefined,
  });
  const rows = query.data?.pages.flatMap((p) => p.rows) ?? [];
  const header = (
    <>
      <AppHeader
        eyebrow="DISCOVER"
        title="Explore gyms"
        location={applied.city || (location.coordinates ? "Near you" : "Search by city")}
      />
      <Input
        label="Search gyms or areas"
        value={search}
        onChangeText={setSearch}
        placeholder="Gym name, area or city…"
      />
      <Input
        label="City"
        value={city}
        onChangeText={setCity}
        placeholder="e.g. Bengaluru"
      />
      <View style={local.chips}>
        <Chip
          label="Nearby"
          selected={Boolean(location.coordinates)}
          onPress={() => void location.locate()}
        />
        <Chip
          label="5 km"
          selected={radius === "5"}
          onPress={() => setRadius("5")}
        />
        <Chip
          label="10 km"
          selected={radius === "10"}
          onPress={() => setRadius("10")}
        />
        <Chip
          label="Parking"
          selected={amenities.includes("parking")}
          onPress={() =>
            setAmenities(
              amenities.includes("parking")
                ? amenities
                    .split(",")
                    .filter((item) => item !== "parking")
                    .join(",")
                : [amenities, "parking"].filter(Boolean).join(","),
            )
          }
        />
        <Chip
          label="Wi-Fi"
          selected={amenities.includes("wifi")}
          onPress={() =>
            setAmenities(
              amenities.includes("wifi")
                ? amenities
                    .split(",")
                    .filter((item) => item !== "wifi")
                    .join(",")
                : [amenities, "wifi"].filter(Boolean).join(","),
            )
          }
        />
        <Chip label="Flex" onPress={() => navigation.navigate("Flex")} />
      </View>
      <Button
        label="Show matching gyms"
        disabled={
          !Number.isFinite(Number(radius)) ||
          Number(radius) < 0.1 ||
          Number(radius) > 50
        }
        onPress={() => {
          setFilters({
            state: "",
            amenities: amenities.trim(),
            radiusKm: radius,
          });
          setApplied({ search: search.trim(), city: city.trim() });
        }}
      />
      {["denied", "restricted", "unavailable"].includes(location.status) && (
        <Copy>Location unavailable. You can continue with city search.</Copy>
      )}
      {location.status === "restricted" && (
        <Button
          label="Open location settings"
          onPress={() => void Linking.openSettings()}
        />
      )}
      {location.coordinates && (
        <Copy>
          Nearby mode uses radius and amenities. Use city search for text, city
          and state filters.
        </Copy>
      )}
      <State
        loading={query.isLoading}
        error={query.error}
        empty={!query.isLoading && !query.error && rows.length === 0}
        retry={() => void query.refetch()}
      />
      <SectionTitle>Recommended for you</SectionTitle>
      <State
        loading={recommended.isLoading}
        error={recommended.error}
        empty={
          !recommended.isLoading &&
          recommended.data?.pages[0]?.data?.length === 0
        }
        retry={() => void recommended.refetch()}
      />
      {recommended.data?.pages[0]?.data?.slice(0, 3).map((item) => (
        <GymCard
          key={`recommended-${item.branch.id}`}
          name={item.gym.name}
          meta={`${item.branch.name} · ${item.branch.city}`}
          detail={item.reasons
            .map((reason) => recommendationReasonLabel[reason])
            .join(" · ")}
          image={gymVisual(item.gym.id)}
          onPress={() => navigation.navigate("Gym", { gymId: item.gym.id })}
        />
      ))}
      <SectionTitle>All gyms</SectionTitle>
    </>
  );
  return (
    <Screen top scroll={false}>
      <FlatList
        ListHeaderComponent={header}
        keyboardShouldPersistTaps="handled"
        data={rows}
        keyExtractor={(row) => row.id}
        refreshing={query.isRefetching}
        onRefresh={() => void query.refetch()}
        onEndReached={() => {
          if (query.hasNextPage && !query.isFetchingNextPage)
            void query.fetchNextPage();
        }}
        renderItem={({ item }) => (
          <GymCard
            name={item.name}
            meta={item.description}
            detail={item.amenities || "Plans available"}
            image={gymVisual(item.gymId)}
            onPress={() => navigation.navigate("Gym", { gymId: item.gymId })}
          />
        )}
      />
    </Screen>
  );
}

const local = StyleSheet.create({
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginVertical: 2 },
});
