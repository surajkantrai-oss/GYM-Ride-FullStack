import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import { DefaultTheme, NavigationContainer, createNavigationContainerRef } from "@react-navigation/native";
import * as Notifications from "expo-notifications";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { RootStack } from "./types";
import { queryClient, useSession } from "../store/session";
import { Screen, State, palette } from "../components/ui";
import { AppIcon, type AppIconName } from "../components/AppIcon";
import { colors, shadows, spacing, typography } from "../components/theme";
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
import { useOnboarding } from "../store/onboarding";
import { OnboardingScreen } from "../features/onboarding/OnboardingScreen";
const Stack = createNativeStackNavigator<RootStack>();
const Tabs = createBottomTabNavigator();
const navigationRef = createNavigationContainerRef<RootStack>();
const transparentNavigationTheme = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, background: "transparent" },
};
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
  const insets = useSafeAreaInsets();
  const icons: Record<string, AppIconName> = { Home: "home", Explore: "compass", Bookings: "calendar", Profile: "user" };
  return (
    <Tabs.Navigator
      screenOptions={({ route }) => ({
        tabBarActiveTintColor: palette.accent,
        tabBarInactiveTintColor: palette.muted,
        tabBarIcon: ({ color, focused }) => (
          <View style={[navigatorStyles.tabIcon, focused && navigatorStyles.tabIconActive]}>
            <AppIcon name={icons[route.name]!} size={26} color={focused ? colors.white : color} filled={focused} />
          </View>
        ),
        tabBarLabelStyle: navigatorStyles.tabLabel,
        tabBarItemStyle: navigatorStyles.tabItem,
        sceneStyle: navigatorStyles.scene,
        tabBarStyle: [
          navigatorStyles.tabBar,
          { height: 76 + Math.max(insets.bottom, 8), paddingBottom: Math.max(insets.bottom, 8) },
        ],
        headerShown: false,
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
  const onboarding = useOnboarding();
  useEffect(() => {
    if (!user) return;
    const received = Notifications.addNotificationReceivedListener(() => {
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
      void queryClient.invalidateQueries({ queryKey: ["unread-count"] });
    });
    const tapped = Notifications.addNotificationResponseReceivedListener((response) => openPushData(response.notification.request.content.data));
    return () => { received.remove(); tapped.remove(); };
  }, [user?.id]);
  if (restoring || onboarding.restoring)
    return (
      <Screen top scroll={false}>
        <View style={navigatorStyles.boot}>
          <View style={navigatorStyles.bootLogo}><Text style={navigatorStyles.bootLogoText}>GR</Text></View>
          <Text style={navigatorStyles.bootBrand}>GYMRide</Text>
          <Text style={navigatorStyles.bootLine}>Find. Fit. Belong.</Text>
        </View>
        <State loading />
      </Screen>
    );
  if (onboarding.shouldShow)
    return <OnboardingScreen onComplete={onboarding.complete} />;
  if (!user) return <LoginScreen />;
  return (
    <NavigationContainer theme={transparentNavigationTheme} ref={navigationRef} onReady={() => {
      void Notifications.getLastNotificationResponseAsync().then((response) => {
        if (response) {
          openPushData(response.notification.request.content.data);
          void Notifications.clearLastNotificationResponseAsync();
        }
      });
    }}>
      <Stack.Navigator screenOptions={{ contentStyle: navigatorStyles.scene, headerTintColor: palette.ink, headerStyle: { backgroundColor: palette.canvas }, headerShadowVisible: false, headerTitleStyle: { fontWeight: "800" } }}>
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

const navigatorStyles = StyleSheet.create({
  scene: { backgroundColor: "transparent" },
  tabBar: {
    paddingTop: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    ...shadows.bottomNavigation,
  },
  tabItem: { minHeight: 62 },
  tabLabel: { fontSize: 12, lineHeight: 15, fontWeight: "700", marginTop: 4 },
  tabIcon: { width: 50, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  tabIconActive: { backgroundColor: colors.primary },
  boot: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.sm },
  bootLogo: { width: 68, height: 68, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: colors.primary },
  bootLogoText: { fontSize: 22, fontWeight: "900", color: colors.white },
  bootBrand: { ...typography.heading1, color: colors.textPrimary },
  bootLine: { ...typography.bodySmall, color: colors.textSecondary },
});
