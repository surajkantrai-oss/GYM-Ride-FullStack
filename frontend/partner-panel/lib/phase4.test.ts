import { describe, expect, it } from "vitest";
import {
  availabilityTotals,
  bookingFilterQuery,
  nextPlanAction,
} from "./phase4";
describe("partner Phase 4 workflows", () => {
  it("maps activation lifecycle without exposing archived mutation", () => {
    expect(nextPlanAction("DRAFT")).toBe("activate");
    expect(nextPlanAction("ACTIVE")).toBe("deactivate");
    expect(nextPlanAction("ARCHIVED")).toBeNull();
  });
  it("builds booking filters without empty parameters", () => {
    expect(
      bookingFilterQuery({
        gymId: "gym",
        branchId: "",
        status: "CONFIRMED",
        page: 2,
      }),
    ).toBe("?gymId=gym&status=CONFIRMED&page=2");
  });
  it("summarizes only backend-provided availability", () => {
    expect(
      availabilityTotals([
        {
          id: "a",
          startAt: "",
          endAt: "",
          capacity: 20,
          reserved: 3,
          confirmed: 15,
          available: 2,
          status: "AVAILABLE",
        },
      ]),
    ).toBe(2);
  });
});
