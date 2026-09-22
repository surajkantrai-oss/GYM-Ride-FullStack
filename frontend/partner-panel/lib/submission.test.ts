import { describe, expect, it } from "vitest";
import { canEditGym, submissionRequirementLabel } from "./submission";
describe("partner submission state", () => {
  it("keeps review-state gyms read-only", () => {
    expect(canEditGym("DRAFT")).toBe(true);
    expect(canEditGym("REJECTED")).toBe(true);
    expect(canEditGym("PENDING_APPROVAL")).toBe(false);
  });
  it("turns backend requirement codes into useful guidance", () => {
    expect(submissionRequirementLabel("branch_operating_hours")).toContain(
      "every branch",
    );
  });
});
