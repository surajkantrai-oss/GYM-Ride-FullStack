import { useInfiniteQuery } from "@tanstack/react-query";
import { FlatList } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStack } from "../../navigation/types";
import { Button, Card, Copy, Screen, State, Title } from "../../components/ui";
import { useSession } from "../../store/session";
import { bookingGroup, money } from "../../utils/domain";
export function BookingsScreen() {
  const { api } = useSession();
  const navigation = useNavigation<NativeStackNavigationProp<RootStack>>();
  const query = useInfiniteQuery({
    queryKey: ["bookings", "list"],
    initialPageParam: 1,
    queryFn: ({ pageParam }) => api.bookings(pageParam),
    getNextPageParam: (last) =>
      last.meta.hasNextPage ? last.meta.page + 1 : undefined,
  });
  const rows = query.data?.pages.flatMap((p) => p.data) ?? [];
  return (
    <Screen scroll={false}>
      <Title>Your workouts</Title>
      <State
        loading={query.isLoading}
        error={query.error}
        empty={!query.isLoading && rows.length === 0}
        retry={() => void query.refetch()}
      />
      <FlatList
        data={rows}
        keyExtractor={(b) => b.id}
        refreshing={query.isRefetching}
        onRefresh={() => void query.refetch()}
        onEndReached={() => {
          if (query.hasNextPage && !query.isFetchingNextPage)
            void query.fetchNextPage();
        }}
        renderItem={({ item }) => (
          <Card>
            <Copy>
              {bookingGroup(item.status)} · {item.status.replaceAll("_", " ")}
            </Copy>
            <Title>{item.gym.name}</Title>
            <Copy>
              {item.branch.name} · {item.planName}
            </Copy>
            <Copy>{money(item.priceMinor, item.currency)}</Copy>
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
