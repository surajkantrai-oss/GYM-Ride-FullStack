import { describe, expect, it } from "vitest";
import { slotConfigSchema } from "@gymride/validation";
import { FIRST_SLOT_CONFIG_DEFAULTS } from "./slot-defaults";

describe("first-time Slot Settings", () => {
  it("provides a complete valid form model without persisting configuration", () => {
    expect(slotConfigSchema.parse(FIRST_SLOT_CONFIG_DEFAULTS)).toEqual({
      slotDurationMinutes: 60,
      defaultCapacity: 20,
      bookingWindowDays: 30,
      minimumAdvanceMinutes: 60,
      isActive: true,
    });
  });

  it("rejects invalid first-time values before save", () => {
    expect(
      slotConfigSchema.safeParse({
        ...FIRST_SLOT_CONFIG_DEFAULTS,
        slotDurationMinutes: 0,
        defaultCapacity: 0,
      }).success,
    ).toBe(false);
  });
});
