import { describe, expect, it } from "vitest";
import { partnerReviewParams } from "./review-filters";

describe("partner review filters", () => {
  it("requests only chosen gym, branch, rating, and inclusive dates", () => {
    const params = partnerReviewParams({ page: 3, gymId: "gym-a", branchId: "branch-a", rating: "5", from: "2026-09-01", to: "2026-09-03" });
    expect(params.get("gymId")).toBe("gym-a");
    expect(params.get("branchId")).toBe("branch-a");
    expect(params.get("rating")).toBe("5");
    expect(params.get("from")).toContain("2026-09-01");
    expect(params.get("to")).toContain("2026-09-03");
    expect(params.get("page")).toBe("3");
  });
  it("does not add a gym outside the current filter selection", () => {
    const params = partnerReviewParams({ page: 1, gymId: "", branchId: "", rating: "", from: "", to: "" });
    expect(params.has("gymId")).toBe(false);
    expect(params.has("branchId")).toBe(false);
  });
});
