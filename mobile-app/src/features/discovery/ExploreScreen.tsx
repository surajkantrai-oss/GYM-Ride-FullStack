import { useState } from "react";
import { FlatList, Linking } from "react-native";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
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
import { useDiscoveryLocation } from "./useLocation";
import { recommendationReasonLabel } from "../recommendations/reasons";
export function ExploreScreen() {
  const { api } = useSession();
  const navigation = useNavigation<NativeStackNavigationProp<RootStack>>();
  const location = useDiscoveryLocation();
  const [search, setSearch] = useState("");
  const [city, setCity] = useState("");
  const [applied, setApplied] = useState({ search: "", city: "" });
  const [state, setState] = useState("");
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
    queryKey: ["recommendations", "explore", applied, filters, location.coordinates],
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => api.recommendations(new URLSearchParams({ ...(location.coordinates ? { latitude: String(location.coordinates.latitude), longitude: String(location.coordinates.longitude) } : applied.city ? { city: applied.city } : {}), radiusKm: filters.radiusKm, amenities: filters.amenities, page: String(pageParam), limit: "10" }).toString()),
    getNextPageParam: (last) => last.meta.hasNextPage ? last.meta.page + 1 : undefined,
  });
  const rows = query.data?.pages.flatMap((p) => p.rows) ?? [];
  const header = (
    <>
      <Title>Find your gym</Title>
      <Copy>Use your location once for nearby gyms, or search by city.</Copy>
      <Button
        label={
          location.status === "loading"
            ? "Finding location…"
            : "Use my location"
        }
        disabled={location.status === "loading"}
        onPress={() => void location.locate()}
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
      <Input label="Gym or area" value={search} onChangeText={setSearch} />
      <Input label="City" value={city} onChangeText={setCity} />
      <Input label="State" value={state} onChangeText={setState} />
      <Input
        label="Amenities (comma-separated codes)"
        value={amenities}
        onChangeText={setAmenities}
      />
      <Input
        label="Nearby radius in km (0.1–50)"
        value={radius}
        onChangeText={setRadius}
        keyboardType="decimal-pad"
      />
      <Button
        label="Apply filters"
        disabled={
          !Number.isFinite(Number(radius)) ||
          Number(radius) < 0.1 ||
          Number(radius) > 50
        }
        onPress={() => {
          setFilters({
            state: state.trim(),
            amenities: amenities.trim(),
            radiusKm: radius,
          });
          setApplied({ search: search.trim(), city: city.trim() });
        }}
      />
      <Button
        label="Search by city instead"
        onPress={() => {
          location.clear();
          setApplied({ search: search.trim(), city: city.trim() });
          setFilters({
            ...filters,
            state: state.trim(),
            amenities: amenities.trim(),
          });
        }}
      />
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
      <Title>Recommended</Title>
      <State loading={recommended.isLoading} error={recommended.error} empty={!recommended.isLoading && recommended.data?.pages[0]?.data?.length === 0} retry={() => void recommended.refetch()} />
      {recommended.data?.pages[0]?.data?.slice(0, 3).map((item) => <Card key={`recommended-${item.branch.id}`}><Title>{item.gym.name}</Title><Copy>{item.branch.name} · {item.branch.city}</Copy><Copy>{item.reasons.map((reason) => recommendationReasonLabel[reason]).join(" · ")}</Copy><Button label={`View ${item.gym.name}`} onPress={() => navigation.navigate("Gym", { gymId: item.gym.id })} /></Card>)}
    </>
  );
  return (
    <Screen scroll={false}>
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
          <Card>
            <Title>{item.name}</Title>
            <Copy>{item.description}</Copy>
            {!!item.amenities && <Copy>{item.amenities}</Copy>}
            <Button
              label={`View ${item.name}`}
              onPress={() => navigation.navigate("Gym", { gymId: item.gymId })}
            />
          </Card>
        )}
      />
    </Screen>
  );
}
