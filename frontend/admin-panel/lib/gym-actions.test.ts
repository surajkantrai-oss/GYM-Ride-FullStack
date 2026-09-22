import { describe, expect, it } from "vitest";
import { availableAdminActions } from "./gym-actions";
describe("admin gym actions", () => {
  it("exposes only valid review controls", () => {
    expect(availableAdminActions("PENDING_APPROVAL")).toEqual([
      "approve",
      "reject",
    ]);
    expect(availableAdminActions("APPROVED")).toEqual(["suspend"]);
    expect(availableAdminActions("SUSPENDED")).toEqual(["reactivate"]);
    expect(availableAdminActions("REJECTED")).toEqual([]);
    expect(availableAdminActions("DRAFT")).toEqual([]);
  });
});
