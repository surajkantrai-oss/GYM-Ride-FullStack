import { useEffect } from "react";
import { Text } from "react-native";
import { NavigationContainer, createNavigationContainerRef } from "@react-navigation/native";
import * as Notifications from "expo-notifications";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import type { RootStack } from "./types";
import { queryClient, useSession } from "../store/session";
import { Screen, State, palette } from "../components/ui";
import { LoginScreen } from "../features/auth/LoginScreen";
import { HomeScreen } from "../features/home/HomeScreen";
import { ExploreScreen } from "../features/discovery/ExploreScreen";
import { GymScreen } from "../features/gyms/GymScreen";
import { PlanScreen } from "../features/plans/PlanScreen";
import { SlotsScreen } from "../features/slots/SlotsScreen";
import { ReviewScreen } from "../features/bookings/ReviewScreen";
import { BookingsScreen } from "../features/bookings/BookingsScreen";
import { BookingScreen } from "../features/bookings/BookingScreen";
import { PaymentScreen } from "../features/payments/PaymentScreen";
import { ProfileScreen } from "../features/profile/ProfileScreen";
import { CheckInScreen } from "../features/check-in/CheckInScreen";
import { BookingReviewScreen } from "../features/reviews/BookingReviewScreen";
import { GymReviewsScreen } from "../features/reviews/GymReviewsScreen";
import { NotificationsScreen } from "../features/notifications/NotificationsScreen";
import { FlexScreen } from "../features/flex/FlexScreen";
import { PreferencesScreen } from "../features/recommendations/PreferencesScreen";
import { safeNotificationRoute } from "../features/notifications/routing";
const Stack = createNativeStackNavigator<RootStack>();
const Tabs = createBottomTabNavigator();
const navigationRef = createNavigationContainerRef<RootStack>();
function openPushData(data: unknown) {
  if (!navigationRef.isReady()) return;
  const route = safeNotificationRoute(data);
  if (route?.screen === "Booking") navigationRef.navigate("Booking", { bookingId: route.bookingId });
  else if (route?.screen === "CheckIn") navigationRef.navigate("CheckIn", { bookingId: route.bookingId });
  else if (route?.screen === "BookingReview") navigationRef.navigate("BookingReview", { bookingId: route.bookingId });
  else if (route?.screen === "Gym") navigationRef.navigate("Gym", { gymId: route.gymId });
  else if (route?.screen === "Flex") navigationRef.navigate("Flex");
  else navigationRef.navigate("Notifications");
}
function MainTabs() {
  const icons: Record<string, string> = { Home: "⌂", Explore: "⌕", Bookings: "▣", Profile: "○" };
  return (
    <Tabs.Navigator
      screenOptions={({ route }) => ({
        tabBarActiveTintColor: palette.accent,
        tabBarInactiveTintColor: palette.muted,
        tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 19, fontWeight: "800" }}>{icons[route.name]}</Text>,
        tabBarLabelStyle: { fontSize: 11, fontWeight: "700", marginTop: 1 },
        tabBarStyle: { height: 72, paddingTop: 8, paddingBottom: 10, backgroundColor: palette.surface, borderTopColor: palette.border },
        headerStyle: { backgroundColor: palette.canvas },
        headerShadowVisible: false,
        headerTitleStyle: { color: palette.ink, fontWeight: "800" },
      })}
    >
      <Tabs.Screen name="Home" component={HomeScreen} />
      <Tabs.Screen name="Explore" component={ExploreScreen} />
      <Tabs.Screen name="Bookings" component={BookingsScreen} />
      <Tabs.Screen name="Profile" component={ProfileScreen} />
    </Tabs.Navigator>
  );
}
export function AppNavigator() {
  const { user, restoring } = useSession();
  useEffect(() => {
    if (!user) return;
    const received = Notifications.addNotificationReceivedListener(() => {
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
      void queryClient.invalidateQueries({ queryKey: ["unread-count"] });
    });
    const tapped = Notifications.addNotificationResponseReceivedListener((response) => openPushData(response.notification.request.content.data));
    return () => { received.remove(); tapped.remove(); };
  }, [user?.id]);
  if (restoring)
    return (
      <Screen>
        <State loading />
      </Screen>
    );
  if (!user) return <LoginScreen />;
  return (
    <NavigationContainer ref={navigationRef} onReady={() => {
      void Notifications.getLastNotificationResponseAsync().then((response) => {
        if (response) {
          openPushData(response.notification.request.content.data);
          void Notifications.clearLastNotificationResponseAsync();
        }
      });
    }}>
      <Stack.Navigator screenOptions={{ headerTintColor: palette.ink, headerStyle: { backgroundColor: palette.canvas }, headerShadowVisible: false, headerTitleStyle: { fontWeight: "800" } }}>
        <Stack.Screen
          name="Main"
          component={MainTabs}
          options={{ headerShown: false }}
        />
        <Stack.Screen name="Gym" component={GymScreen} />
        <Stack.Screen name="Plan" component={PlanScreen} />
        <Stack.Screen name="Slots" component={SlotsScreen} />
        <Stack.Screen name="Review" component={ReviewScreen} />
        <Stack.Screen name="Payment" component={PaymentScreen} />
        <Stack.Screen name="Booking" component={BookingScreen} />
        <Stack.Screen
          name="CheckIn"
          component={CheckInScreen}
          options={{ title: "Gym check-in" }}
        />
        <Stack.Screen name="BookingReview" component={BookingReviewScreen} options={{ title: "Review your visit" }} />
        <Stack.Screen name="GymReviews" component={GymReviewsScreen} options={{ title: "Gym reviews" }} />
        <Stack.Screen name="Notifications" component={NotificationsScreen} />
        <Stack.Screen name="Flex" component={FlexScreen} options={{ title: "GYMRide Flex" }} />
        <Stack.Screen name="GymPreferences" component={PreferencesScreen} options={{ title: "Recommendation preferences" }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
