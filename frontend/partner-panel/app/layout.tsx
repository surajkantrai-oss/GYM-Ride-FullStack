import type { Metadata } from "next";
import { AppProviders } from "@gymride/web-ui";
import { api } from "@/lib/api";
import "./globals.css";
export const metadata: Metadata = {
  title: "GYMRide Partner",
  description: "Gym partner workspace",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <AppProviders
          api={api}
          allowedRoles={[
            "GYM_OWNER",
            "GYM_MANAGER",
            "GYM_STAFF",
            "ADMIN",
            "SUPER_ADMIN",
          ]}
          allowAuthenticatedWithoutRole
        >
          {children}
        </AppProviders>
      </body>
    </html>
  );
}
