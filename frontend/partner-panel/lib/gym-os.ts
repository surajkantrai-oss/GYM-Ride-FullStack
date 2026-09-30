import type {
  GymOsMembershipStatus,
  GymOsSubscriptionStatus,
  RoleName,
} from "@gymride/types";

export function canManageGymOsBilling(roles: RoleName[]): boolean {
  return roles.some(
    (role) =>
      role === "GYM_OWNER" || role === "ADMIN" || role === "SUPER_ADMIN",
  );
}

export function hasGymOsAccess(status?: GymOsSubscriptionStatus): boolean {
  return status === "ACTIVE";
}

export function canManageGymOsMembers(roles: RoleName[]): boolean {
  return roles.some((role) => role === "GYM_OWNER" || role === "GYM_MANAGER");
}
export function canOperateGymOsAttendance(roles: RoleName[]): boolean {
  return roles.some((role) =>
    ["GYM_OWNER", "GYM_MANAGER", "GYM_STAFF"].includes(role),
  );
}

export function attendanceDateFrom(
  range: "TODAY" | "7_DAYS" | "30_DAYS",
  now = new Date(),
): string {
  const days = range === "7_DAYS" ? 7 : range === "30_DAYS" ? 30 : 1;
  return new Date(now.getTime() - (days - 1) * 86_400_000)
    .toISOString()
    .slice(0, 10);
}
export function canReverseGymOsPayment(roles: RoleName[]): boolean {
  return roles.some((role) => role === "GYM_OWNER" || role === "GYM_MANAGER");
}
export function remainingAfterPayment(outstandingMinor:number,paymentMinor:number):number{return Math.max(0,outstandingMinor-paymentMinor);}
export function memberCapacityState(
  active: number,
  limit: number,
): "available" | "near" | "full" | "over" {
  if (active > limit) return "over";
  if (active === limit) return "full";
  if (limit - active <= 5) return "near";
  return "available";
}

export function membershipActions(
  status: GymOsMembershipStatus,
  canWrite: boolean,
): Array<"freeze" | "resume" | "renew" | "cancel"> {
  if (!canWrite) return [];
  if (status === "ACTIVE") return ["freeze", "renew", "cancel"];
  if (status === "FROZEN") return ["resume", "renew", "cancel"];
  if (status === "SCHEDULED") return ["renew", "cancel"];
  if (status === "EXPIRED") return ["renew"];
  return [];
}
