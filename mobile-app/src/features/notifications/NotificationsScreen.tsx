import { FlatList, RefreshControl, Text, View } from "react-native";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStack } from "../../navigation/types";
import type { InAppNotification } from "@gymride/types";
import { Button, Card, Copy, Screen, State, Title } from "../../components/ui";
import { useSession } from "../../store/session";
import { safeNotificationRoute } from "./routing";

export function NotificationsScreen({ navigation }: NativeStackScreenProps<RootStack, "Notifications">) {
  const { api } = useSession();
  const cache = useQueryClient();
  const list = useInfiniteQuery({
    queryKey: ["notifications"],
    initialPageParam: 1,
    queryFn: ({ pageParam }) => api.notifications(pageParam),
    getNextPageParam: (lastPage) => lastPage.meta.hasNextPage ? lastPage.meta.page + 1 : undefined,
  });
  const mark = useMutation({ mutationFn: (id: string) => api.markNotificationRead(id), onSuccess: async () => { await cache.invalidateQueries({ queryKey: ["notifications"] }); await cache.invalidateQueries({ queryKey: ["unread-count"] }); } });
  const markAll = useMutation({ mutationFn: () => api.markAllNotificationsRead(), onSuccess: async () => { await cache.invalidateQueries({ queryKey: ["notifications"] }); await cache.invalidateQueries({ queryKey: ["unread-count"] }); } });
  const rows = list.data?.pages.flatMap((page) => page.data) || [];
  const open = (item: InAppNotification) => {
    if (!item.readAt) mark.mutate(item.id);
    const destination = safeNotificationRoute(item.data);
    if (destination?.screen === "Booking") navigation.navigate("Booking", { bookingId: destination.bookingId });
    else if (destination?.screen === "CheckIn") navigation.navigate("CheckIn", { bookingId: destination.bookingId });
    else if (destination?.screen === "BookingReview") navigation.navigate("BookingReview", { bookingId: destination.bookingId });
    else if (destination?.screen === "Gym") navigation.navigate("Gym", { gymId: destination.gymId });
  };
  return <Screen scroll={false}>
    <Title>Notifications</Title>
    <Button label="Mark all read" disabled={markAll.isPending || rows.every((item) => !!item.readAt)} onPress={() => markAll.mutate()} />
    <State loading={list.isLoading} error={list.error || mark.error || markAll.error} empty={!list.isLoading && !list.error && rows.length === 0} retry={() => void list.refetch()} />
    <FlatList
      data={rows}
      keyExtractor={(item) => item.id}
      refreshControl={<RefreshControl refreshing={list.isRefetching} onRefresh={() => void list.refetch()} />}
      onEndReached={() => { if (list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage(); }}
      ListFooterComponent={list.isFetchingNextPage ? <Copy>Loading more…</Copy> : null}
      renderItem={({ item }) => <Card>
        <Text accessibilityRole="header">{item.readAt ? "" : "● "}{item.title}</Text>
        <Copy>{item.body}</Copy>
        <Copy>{new Date(item.createdAt).toLocaleString()}</Copy>
        <View><Button label={`Open ${item.title}`} onPress={() => open(item)} /></View>
      </Card>}
    />
  </Screen>;
}
