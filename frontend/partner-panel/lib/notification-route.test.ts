import { describe, expect, it } from "vitest";
import { partnerNotificationHref } from "./notification-route";

describe("partner notification navigation", () => {
  const id = "b46d3a71-42d9-4f34-b903-131aab4da67d";
  it("routes known review and settlement notices to fixed portal pages", () => {
    expect(partnerNotificationHref({ screen: "PartnerReviews", gymId: id })).toBe("/reviews");
    expect(partnerNotificationHref({ screen: "PartnerSettlement", settlementId: id })).toBe("/finance");
  });
  it("never opens provider-supplied URLs", () => {
    expect(partnerNotificationHref({ screen: "https://evil.invalid", gymId: id })).toBeNull();
    expect(partnerNotificationHref({ screen: "PartnerReviews", gymId: "../admin" })).toBeNull();
  });
});
