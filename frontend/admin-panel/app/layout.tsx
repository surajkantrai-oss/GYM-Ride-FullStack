import type { Metadata } from "next";
import { AppProviders } from "@gymride/web-ui";
import { api } from "@/lib/api";
import "./globals.css";

export const metadata: Metadata = {
  title: "GYMRide Admin",
  description: "Gym operations and approvals",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <AppProviders api={api} allowedRoles={["ADMIN", "SUPER_ADMIN"]}>
          {children}
        </AppProviders>
      </body>
    </html>
  );
}
