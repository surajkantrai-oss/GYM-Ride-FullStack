import { describe, expect, it } from "vitest";
import { adminReviewParams, canSubmitModeration } from "./review-filters";

describe("admin review filtering and moderation controls", () => {
  it("passes rating/status/gym/branch/search filters to the backend", () => {
    const params = adminReviewParams({ page: 2, status: "HIDDEN", rating: "1", gymId: "gym-a", branchId: "branch-b", search: "unsafe text" });
    expect(Object.fromEntries(params)).toEqual({ page: "2", limit: "20", status: "HIDDEN", rating: "1", gymId: "gym-a", branchId: "branch-b", search: "unsafe text" });
  });
  it("requires a reason and blocks duplicate moderation while pending", () => {
    expect(canSubmitModeration("  ", false)).toBe(false);
    expect(canSubmitModeration("bad", true)).toBe(false);
    expect(canSubmitModeration("bad", false)).toBe(true);
  });
});
