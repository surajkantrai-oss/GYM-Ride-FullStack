import { describe, expect, it } from "vitest";
import {
  minorToRupees,
  planFormSchema,
  rupeesToMinor,
  slotConfigSchema,
  validateOperatingHours,
} from "./index";

describe("validateOperatingHours", () => {
  it("accepts split shifts and rejects overlaps", () => {
    expect(
      validateOperatingHours([
        {
          weekday: "MONDAY",
          isClosed: false,
          opensAt: "06:00",
          closesAt: "10:00",
        },
        {
          weekday: "MONDAY",
          isClosed: false,
          opensAt: "17:00",
          closesAt: "21:00",
        },
      ]),
    ).toEqual([]);
    expect(
      validateOperatingHours([
        {
          weekday: "MONDAY",
          isClosed: false,
          opensAt: "06:00",
          closesAt: "12:00",
        },
        {
          weekday: "MONDAY",
          isClosed: false,
          opensAt: "11:00",
          closesAt: "21:00",
        },
      ]),
    ).toContain("MONDAY: time periods overlap");
  });
});

describe("Phase 4 commercial validation", () => {
  it("converts rupees to paise without floating-point multiplication", () => {
    expect(rupeesToMinor("199.99")).toBe(19999);
    expect(minorToRupees(19999)).toBe("199.99");
    expect(() => rupeesToMinor("19.999")).toThrow("Invalid rupee amount");
  });

  it("validates plan branch selection and slot configuration limits", () => {
    expect(
      planFormSchema.safeParse({
        name: "Pass",
        description: "",
        type: "DAY_PASS",
        price: "199.00",
        currency: "INR",
        visitLimit: "",
        branchIds: [],
      }).success,
    ).toBe(false);
    expect(
      slotConfigSchema.safeParse({
        slotDurationMinutes: 10,
        defaultCapacity: 0,
        bookingWindowDays: 120,
        minimumAdvanceMinutes: 0,
        isActive: true,
      }).success,
    ).toBe(false);
    expect(
      slotConfigSchema.safeParse({
        slotDurationMinutes: 60,
        defaultCapacity: 20,
        bookingWindowDays: 30,
        minimumAdvanceMinutes: 60,
        isActive: true,
      }).success,
    ).toBe(true);
  });
});
