import type { BookingCheckIn } from "@gymride/types";

export function checkInAudit(checkIn: BookingCheckIn | null | undefined) {
  if (!checkIn) return null;
  return {
    status: checkIn.status,
    method: checkIn.method ?? "Not verified",
    verifiedAt: checkIn.verifiedAt ?? null,
    verifiedByUserId: checkIn.verifiedBy?.id ?? null,
  };
}
