import { SafeAreaProvider } from "react-native-safe-area-context";
import { QueryClientProvider } from "@tanstack/react-query";
import { SessionProvider, queryClient } from "./src/store/session";
import { AppNavigator } from "./src/navigation/AppNavigator";
import { validateApiUrl } from "./src/config/environment";
import { Copy, Screen, Title } from "./src/components/ui";
import { NetworkStatus } from "./src/components/NetworkStatus";
import { OnboardingProvider } from "./src/store/onboarding";
import { GymBackground } from "./src/components/app-backgrounds";
export default function App() {
  let configured = false;
  try {
    configured = !!validateApiUrl(
      process.env.EXPO_PUBLIC_API_BASE_URL,
      process.env.EXPO_PUBLIC_APP_ENV,
    );
  } catch {
    /* Show safe setup guidance instead of crashing. */
  }
  return (
    <SafeAreaProvider>
      <GymBackground overlay={0.18}>
        {configured ? (
          <QueryClientProvider client={queryClient}>
            <NetworkStatus />
            <SessionProvider>
              <OnboardingProvider>
                <AppNavigator />
              </OnboardingProvider>
            </SessionProvider>
          </QueryClientProvider>
        ) : (
          <Screen>
            <Title>Connection setup required</Title>
            <Copy>
              Configure EXPO_PUBLIC_API_BASE_URL with your backend API URL, then
              restart the development server. Staging and production require
              HTTPS.
            </Copy>
          </Screen>
        )}
      </GymBackground>
    </SafeAreaProvider>
  );
}
