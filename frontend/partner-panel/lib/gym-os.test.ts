import { describe, expect, it } from "vitest";
import {
  canManageGymOsBilling,
  canManageGymOsMembers,
  canOperateGymOsAttendance,
  attendanceDateFrom,
  canReverseGymOsPayment,
  remainingAfterPayment,
  hasGymOsAccess,
  memberCapacityState,
  membershipActions,
} from "./gym-os";

describe("GymOS partner visibility", () => {
  it("keeps billing owner/admin only while managers remain read-only", () => {
    expect(canManageGymOsBilling(["GYM_OWNER"])).toBe(true);
    expect(canManageGymOsBilling(["GYM_MANAGER"])).toBe(false);
  });

  it("shows lifecycle actions by membership state and role", () => {
    expect(membershipActions("ACTIVE", true)).toEqual([
      "freeze",
      "renew",
      "cancel",
    ]);
    expect(membershipActions("FROZEN", true)).toEqual([
      "resume",
      "renew",
      "cancel",
    ]);
    expect(membershipActions("EXPIRED", true)).toEqual(["renew"]);
    expect(membershipActions("CANCELLED", true)).toEqual([]);
    expect(membershipActions("ACTIVE", false)).toEqual([]);
  });
  it("allows owners/managers to manage members while staff remains read-only", () => {
    expect(canManageGymOsMembers(["GYM_OWNER"])).toBe(true);
    expect(canManageGymOsMembers(["GYM_MANAGER"])).toBe(true);
    expect(canManageGymOsMembers(["GYM_STAFF"])).toBe(false);
  });
  it("classifies member capacity", () => {
    expect(memberCapacityState(145, 150)).toBe("near");
    expect(memberCapacityState(150, 150)).toBe("full");
    expect(memberCapacityState(151, 150)).toBe("over");
  });

  it("shows the operating dashboard only for active or trial access", () => {
    expect(hasGymOsAccess("TRIALING")).toBe(false);
    expect(hasGymOsAccess("ACTIVE")).toBe(true);
    expect(hasGymOsAccess("EXPIRED")).toBe(false);
    expect(hasGymOsAccess("PENDING_PAYMENT")).toBe(false);
  });
  it("allows operational attendance for owner, manager and branch staff", () => {
    expect(canOperateGymOsAttendance(["GYM_OWNER"])).toBe(true);
    expect(canOperateGymOsAttendance(["GYM_MANAGER"])).toBe(true);
    expect(canOperateGymOsAttendance(["GYM_STAFF"])).toBe(true);
    expect(canOperateGymOsAttendance(["CUSTOMER"])).toBe(false);
  });
  it("builds deterministic bounded attendance windows", () => {
    const now = new Date("2026-09-27T12:00:00.000Z");
    expect(attendanceDateFrom("TODAY", now)).toBe("2026-09-27");
    expect(attendanceDateFrom("7_DAYS", now)).toBe("2026-09-21");
    expect(attendanceDateFrom("30_DAYS", now)).toBe("2026-08-29");
  });
  it("keeps member-finance reversal away from staff",()=>{expect(canReverseGymOsPayment(["GYM_OWNER"])).toBe(true);expect(canReverseGymOsPayment(["GYM_MANAGER"])).toBe(true);expect(canReverseGymOsPayment(["GYM_STAFF"])).toBe(false);});
  it("previews partial payment remaining without negative money",()=>{expect(remainingAfterPayment(300000,150000)).toBe(150000);expect(remainingAfterPayment(50000,60000)).toBe(0);});
});
