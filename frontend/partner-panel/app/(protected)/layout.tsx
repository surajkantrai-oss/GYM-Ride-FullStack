"use client";
import { AppShell, AuthGate, PageState, useAuth } from "@gymride/web-ui";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import type { DashboardSummary } from "@gymride/types";
import { api } from "@/lib/api";
const nav = [
  { href: "/dashboard", label: "Dashboard", short: "DB" },
  { href: "/flex", label: "Flex", short: "FX" },
  { href: "/finance", label: "Finance", short: "FN" },
  { href: "/gym-os", label: "GymOS", short: "OS" },
  { href: "/gym-os/members", label: "Members", short: "MB" },
  { href: "/gym-os/membership-plans", label: "Membership plans", short: "MP" },
  { href: "/gym-os/memberships", label: "Memberships", short: "MS" },
  { href: "/gym-os/attendance", label: "Attendance", short: "AT" },
  { href: "/gym-os/payments", label: "Payments / Dues", short: "₹" },
  { href: "/gym-os/analytics", label: "Analytics", short: "AN" },
  { href: "/gym-os/reminders", label: "Reminders", short: "RM" },
  { href: "/gyms", label: "My gyms", short: "GY" },
  { href: "/bookings", label: "Bookings", short: "BK" },
  { href: "/reviews", label: "Reviews", short: "RV" },
  { href: "/notifications", label: "Notifications", short: "NT" },
  { href: "/check-ins", label: "Check-ins", short: "CI" },
  { href: "/gyms/new", label: "Create gym", short: "+" },
  { href: "/profile", label: "Profile", short: "ME" },
];
const onboardingPaths = ["/onboarding", "/profile"];
export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = useAuth();
  const { status } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const relationship = useQuery({
    queryKey: ["partner-access-relationship"],
    enabled: status === "authenticated",
    queryFn: () => api.request<DashboardSummary>("/partner/gyms/summary"),
  });
  const needsOnboarding =
    status === "onboarding" ||
    (status === "authenticated" && relationship.data?.totalGyms === 0);
  useEffect(() => {
    if (needsOnboarding && !onboardingPaths.includes(pathname))
      router.replace("/onboarding");
  }, [needsOnboarding, pathname, router]);
  const onboardingNav = [
    { href: "/onboarding", label: "Register gym", short: "+" },
    { href: "/profile", label: "Profile", short: "ME" },
  ];
  const visibleNav = user?.roles.includes("GYM_STAFF")
    ? nav.filter((item) =>
        [
          "/check-ins",
          "/gym-os/members",
          "/gym-os/membership-plans",
          "/gym-os/memberships",
          "/gym-os/attendance",
          "/gym-os/payments",
          "/gym-os/analytics",
          "/profile",
        ].includes(item.href),
      )
    : nav;
  return (
    <AuthGate>
      <AppShell appName="Partner" nav={needsOnboarding ? onboardingNav : visibleNav}>
        {status === "authenticated" && relationship.isLoading ? (
          <PageState title="Checking your gym access…" />
        ) : needsOnboarding && !onboardingPaths.includes(pathname) ? null : children}
      </AppShell>
    </AuthGate>
  );
}
