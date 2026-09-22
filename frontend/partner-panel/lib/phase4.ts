import type { PlanStatus, SlotAvailability } from "@gymride/types";
export const nextPlanAction = (status: PlanStatus) =>
  status === "ACTIVE"
    ? "deactivate"
    : status === "ARCHIVED"
      ? null
      : "activate";
export function bookingFilterQuery(
  values: Record<string, string | number | undefined>,
) {
  const params = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    if (value !== undefined && value !== "") params.set(key, String(value));
  });
  return `?${params}`;
}
export const availabilityTotals = (slots: SlotAvailability[]) =>
  slots.reduce((total, slot) => total + slot.available, 0);
