import type { GymStatus } from "@gymride/types";
export function availableAdminActions(status: GymStatus) {
  if (status === "PENDING_APPROVAL") return ["approve", "reject"] as const;
  if (status === "APPROVED") return ["suspend"] as const;
  if (status === "SUSPENDED") return ["reactivate"] as const;
  return [] as const;
}
