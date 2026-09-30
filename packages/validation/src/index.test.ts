import { describe, expect, it } from "vitest";
import {
  branchSchema,
  minorToRupees,
  planFormSchema,
  rupeesToMinor,
  slotConfigSchema,
  validateOperatingHours,
} from "./index";

describe("branchSchema", () => {
  const validBranch = {
    name: "MP Nagar",
    address: "Zone 1, MP Nagar",
    city: "Bhopal",
    state: "Madhya Pradesh",
    postalCode: "462011",
    country: "IN",
    latitude: "23.2325",
    longitude: "77.4303",
    phone: "+919876543220",
    email: "branch@example.com",
    timezone: "Asia/Kolkata",
  };

  it("matches the API's international phone requirement", () => {
    expect(branchSchema.safeParse(validBranch).success).toBe(true);
    expect(
      branchSchema.safeParse({ ...validBranch, phone: "9876543220" }).success,
    ).toBe(false);
    expect(branchSchema.safeParse({ ...validBranch, phone: "" }).success).toBe(
      true,
    );
  });

  it("does not silently turn blank coordinates into zero", () => {
    expect(
      branchSchema.safeParse({ ...validBranch, latitude: "" }).success,
    ).toBe(false);
    expect(
      branchSchema.safeParse({ ...validBranch, longitude: "" }).success,
    ).toBe(false);
  });
});

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
