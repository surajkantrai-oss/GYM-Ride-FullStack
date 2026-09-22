"use client";
import { AppShell, AuthGate, useAuth } from "@gymride/web-ui";
const nav = [
  { href: "/finance", label: "Finance", short: "FN" },
  { href: "/dashboard", label: "Dashboard", short: "DB" },
  { href: "/gyms", label: "My gyms", short: "GY" },
  { href: "/bookings", label: "Bookings", short: "BK" },
  { href: "/reviews", label: "Reviews", short: "RV" },
  { href: "/notifications", label: "Notifications", short: "NT" },
  { href: "/check-ins", label: "Check-ins", short: "CI" },
  { href: "/gyms/new", label: "Create gym", short: "+" },
  { href: "/profile", label: "Profile", short: "ME" },
];
export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = useAuth();
  const visibleNav = user?.roles.includes("GYM_STAFF")
    ? nav.filter((item) => ["/check-ins", "/profile"].includes(item.href))
    : nav;
  return (
    <AuthGate>
      <AppShell appName="Partner" nav={visibleNav}>
        {children}
      </AppShell>
    </AuthGate>
  );
}
