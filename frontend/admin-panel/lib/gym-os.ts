import type { GymOsPlanStatus } from "@gymride/types";

export function nextGymOsPlanAction(
  status: GymOsPlanStatus,
): "activate" | "deactivate" | "none" {
  if (status === "ACTIVE") return "deactivate";
  if (status === "DRAFT" || status === "INACTIVE") return "activate";
  return "none";
}

export function adminAttendanceQuery(filters: {
  gymId?: string;
  branchId?: string;
  search?: string;
}): string {
  const params = new URLSearchParams({ page: "1", pageSize: "100" });
  if (filters.gymId) params.set("gymId", filters.gymId);
  if (filters.branchId) params.set("branchId", filters.branchId);
  if (filters.search) params.set("search", filters.search);
  return `/admin/gym-os/attendance?${params.toString()}`;
}
export function adminMemberFinanceQuery(kind:"charges"|"payments",filters:{gymId?:string;search?:string}):string{const p=new URLSearchParams({page:"1",pageSize:"100"});if(filters.gymId)p.set("gymId",filters.gymId);if(filters.search)p.set("search",filters.search);return `/admin/gym-os/finance/${kind}?${p}`;}
