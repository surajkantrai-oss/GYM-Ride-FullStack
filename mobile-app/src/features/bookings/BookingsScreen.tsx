import { useInfiniteQuery } from "@tanstack/react-query";
import { useState } from "react";
import { FlatList, Image, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStack } from "../../navigation/types";
import {
  Badge,
  Button,
  Card,
  Chip,
  Copy,
  Screen,
  State,
  Title,
  palette,
} from "../../components/ui";
import { useSession } from "../../store/session";
import { gymVisual } from "../../components/gym-visuals";
import { bookingGroup, money } from "../../utils/domain";
export function BookingsScreen() {
  const { api } = useSession();
  const navigation = useNavigation<NativeStackNavigationProp<RootStack>>();
  const [group, setGroup] = useState<"Upcoming" | "Past" | "Other">("Upcoming");
  const query = useInfiniteQuery({
    queryKey: ["bookings", "list"],
    initialPageParam: 1,
    queryFn: ({ pageParam }) => api.bookings(pageParam),
    getNextPageParam: (last) =>
      last.meta.hasNextPage ? last.meta.page + 1 : undefined,
  });
  const rows = query.data?.pages.flatMap((p) => p.data) ?? [];
  const visibleRows = rows.filter(
    (booking) => bookingGroup(booking.status) === group,
  );
  return (
    <Screen scroll={false}>
      <Title>Your workouts</Title>
      <View style={local.tabs}>
        {(["Upcoming", "Past", "Other"] as const).map((item) => (
          <Chip
            key={item}
            label={item}
            selected={group === item}
            onPress={() => setGroup(item)}
          />
        ))}
      </View>
      <State
        loading={query.isLoading}
        error={query.error}
        empty={!query.isLoading && visibleRows.length === 0}
        retry={() => void query.refetch()}
      />
      <FlatList
        data={visibleRows}
        keyExtractor={(b) => b.id}
        refreshing={query.isRefetching}
        onRefresh={() => void query.refetch()}
        onEndReached={() => {
          if (query.hasNextPage && !query.isFetchingNextPage)
            void query.fetchNextPage();
        }}
        renderItem={({ item }) => (
          <Card>
            <View style={local.bookingTop}>
              <Image source={gymVisual(item.gym.id)} style={local.image} />
              <View style={local.bookingBody}>
                <Badge
                  label={item.status.replaceAll("_", " ")}
                  tone={
                    ["CONFIRMED", "CHECKED_IN", "COMPLETED"].includes(
                      item.status,
                    )
                      ? "success"
                      : item.status === "PAYMENT_PENDING"
                        ? "warning"
                        : "neutral"
                  }
                />
                <Text numberOfLines={2} style={local.name}>
                  {item.gym.name}
                </Text>
                <Copy>
                  {item.branch.name} · {item.planName}
                </Copy>
                <Text style={local.price}>
                  {money(item.priceMinor, item.currency)}
                </Text>
              </View>
            </View>
            <Button
              label="Booking details"
              onPress={() =>
                navigation.navigate("Booking", { bookingId: item.id })
              }
            />
          </Card>
        )}
      />
    </Screen>
  );
}

const local = StyleSheet.create({
  tabs: { flexDirection: "row", gap: 8, marginBottom: 4 },
  bookingTop: { flexDirection: "row", gap: 14 },
  image: {
    width: 105,
    height: 112,
    borderRadius: 16,
    backgroundColor: palette.accentSoft,
  },
  bookingBody: { flex: 1, gap: 5 },
  name: { fontSize: 18, lineHeight: 22, fontWeight: "800", color: palette.ink },
  price: { fontSize: 14, fontWeight: "800", color: palette.accent },
});
