"use client";
import { AppShell, AuthGate } from "@gymride/web-ui";
const nav = [
  { href: "/dashboard", label: "Dashboard", short: "DB" },
  { href: "/flex", label: "Flex", short: "FX" },
  { href: "/finance", label: "Finance", short: "FN" },
  { href: "/gym-os", label: "GymOS", short: "OS" },
  { href: "/gym-os/members", label: "GymOS members", short: "MB" },
  { href: "/gym-os/membership-plans", label: "Membership plans", short: "MP" },
  { href: "/gym-os/memberships", label: "Memberships", short: "MS" },
  { href: "/gym-os/attendance", label: "Attendance", short: "AT" },
  { href: "/gym-os/finance", label: "Member finance", short: "₹" },
  { href: "/gym-os/analytics", label: "GymOS analytics", short: "AN" },
  { href: "/gym-os/reminders", label: "Reminder oversight", short: "RM" },
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
