import { describe, expect, it } from "vitest";
import { recommendationReasonLabel } from "./reasons";

describe("recommendation reason labels", () => {
  it("maps only controlled server reason codes", () => {
    expect(recommendationReasonLabel.NEAR_YOU).toBe("Near you");
    expect(recommendationReasonLabel.FLEX_ELIGIBLE).toBe("Flex eligible");
    expect(Object.keys(recommendationReasonLabel)).toHaveLength(8);
  });
});
