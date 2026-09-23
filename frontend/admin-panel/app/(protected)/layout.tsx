"use client";
import { AppShell, AuthGate } from "@gymride/web-ui";
const nav = [
  { href: "/flex", label: "Flex", short: "FX" },
  { href: "/finance", label: "Finance", short: "FN" },
  { href: "/dashboard", label: "Dashboard", short: "DB" },
  { href: "/gyms", label: "All gyms", short: "GY" },
  { href: "/gyms/pending", label: "Pending review", short: "PR" },
  { href: "/bookings", label: "Bookings", short: "BK" },
  { href: "/reviews", label: "Reviews", short: "RV" },
  { href: "/profile", label: "Profile", short: "ME" },
];
export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGate>
      <AppShell appName="Admin" nav={nav}>
        {children}
      </AppShell>
    </AuthGate>
  );
}
