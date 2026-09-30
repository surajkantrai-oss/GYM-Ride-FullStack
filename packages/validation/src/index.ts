import type { OperatingHoursPeriod } from "@gymride/types";
import { z } from "zod";

const internationalPhoneSchema = z
  .string()
  .trim()
  .regex(
    /^\+[1-9]\d{7,14}$/,
    "Use international format, for example +919876543210",
  );

export const phoneSchema = z.object({ phone: internationalPhoneSchema });

export const otpSchema = phoneSchema.extend({
  otp: z
    .string()
    .trim()
    .regex(/^\d{4,8}$/, "Enter the OTP from your phone"),
});

export const gymSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Name must contain at least 2 characters")
    .max(120),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
});

export const profileSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required").max(80),
  lastName: z.string().trim().min(1, "Last name is required").max(80),
  email: z.union([
    z.literal(""),
    z.string().trim().email("Enter a valid email"),
  ]),
});

export const reasonSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(10, "Give a useful reason (at least 10 characters)")
    .max(1000),
});

export const branchSchema = z.object({
  name: z.string().trim().min(2).max(120),
  address: z.string().trim().min(5).max(255),
  city: z.string().trim().min(2).max(100),
  state: z.string().trim().min(2).max(100),
  postalCode: z.string().trim().min(3).max(20),
  country: z.string().trim().length(2).default("IN"),
  latitude: z
    .string()
    .trim()
    .min(1, "Latitude is required")
    .refine(
      (value) => Number.isFinite(Number(value)) && Math.abs(Number(value)) <= 90,
      "Enter a latitude between -90 and 90",
    ),
  longitude: z
    .string()
    .trim()
    .min(1, "Longitude is required")
    .refine(
      (value) =>
        Number.isFinite(Number(value)) && Math.abs(Number(value)) <= 180,
      "Enter a longitude between -180 and 180",
    ),
  phone: z
    .string()
    .trim()
    .refine(
      (value) => value === "" || /^\+[1-9]\d{7,14}$/.test(value),
      "Use international format, for example +919876543210",
    )
    .optional(),
  email: z.union([z.literal(""), z.string().trim().email()]).optional(),
  timezone: z.string().trim().min(3).default("Asia/Kolkata"),
});

const toMinutes = (time: string) => {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
};

export function validateOperatingHours(periods: OperatingHoursPeriod[]) {
  const errors: string[] = [];
  for (const day of new Set(periods.map((period) => period.weekday))) {
    const dayPeriods = periods
      .filter((period) => period.weekday === day && !period.isClosed)
      .map((period) => ({
        ...period,
        start: toMinutes(period.opensAt!),
        end: toMinutes(period.closesAt!),
      }))
      .sort((a, b) => a.start - b.start);
    dayPeriods.forEach((period, index) => {
      if (period.start >= period.end)
        errors.push(`${day}: closing time must be after opening time`);
      if (index > 0 && period.start < dayPeriods[index - 1].end)
        errors.push(`${day}: time periods overlap`);
    });
  }
  return [...new Set(errors)];
}

export const planFormSchema = z.object({
  name: z.string().trim().min(2).max(160),
  description: z.string().trim().max(5000).optional().or(z.literal("")),
  type: z.enum(["DAY_PASS", "MONTHLY", "QUARTERLY", "YEARLY"]),
  price: z
    .string()
    .trim()
    .regex(
      /^\d{1,7}(?:\.\d{1,2})?$/,
      "Enter a valid rupee amount with up to two decimals",
    ),
  currency: z.literal("INR"),
  visitLimit: z.union([
    z.literal(""),
    z.coerce.number().int().min(1).max(10_000),
  ]),
  branchIds: z.array(z.string().uuid()).min(1, "Select at least one branch"),
});

export const slotConfigSchema = z.object({
  slotDurationMinutes: z.coerce.number().int().min(15).max(180),
  defaultCapacity: z.coerce.number().int().min(1).max(1000),
  bookingWindowDays: z.coerce.number().int().min(1).max(90),
  minimumAdvanceMinutes: z.coerce.number().int().min(0).max(43_200),
  isActive: z.boolean(),
});

export function rupeesToMinor(value: string): number {
  if (!/^\d{1,7}(?:\.\d{1,2})?$/.test(value.trim()))
    throw new Error("Invalid rupee amount");
  const [rupees, paise = ""] = value.trim().split(".");
  return (
    Number.parseInt(rupees, 10) * 100 +
    Number.parseInt(paise.padEnd(2, "0") || "0", 10)
  );
}

export function minorToRupees(value: number) {
  return `${Math.floor(value / 100)}.${String(value % 100).padStart(2, "0")}`;
}
