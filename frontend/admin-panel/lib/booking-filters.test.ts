import { describe, expect, it } from "vitest";
import { adminBookingQuery } from "./booking-filters";
describe("admin booking filters", () => {
  it("preserves supported filters and pagination", () => {
    expect(
      adminBookingQuery({
        status: "EXPIRED",
        gymId: "gym",
        branchId: "",
        from: "2026-09-01",
        page: 3,
      }),
    ).toBe("?status=EXPIRED&gymId=gym&from=2026-09-01&page=3");
  });
});
