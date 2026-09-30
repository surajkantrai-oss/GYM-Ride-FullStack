const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function partnerNotificationHref(data: unknown): string | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const value = data as Record<string, unknown>;
  if (value.screen === "PartnerReviews" && typeof value.gymId === "string" && uuid.test(value.gymId)) return "/reviews";
  if (value.screen === "PartnerSettlement" && typeof value.settlementId === "string" && uuid.test(value.settlementId)) return "/finance";
  if (value.screen === "PartnerGymOs" && typeof value.gymId === "string" && uuid.test(value.gymId)) return `/gym-os?gymId=${value.gymId}`;
  return null;
}
