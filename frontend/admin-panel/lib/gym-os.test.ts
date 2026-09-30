import { describe, expect, it } from "vitest";
import { adminAttendanceQuery, adminMemberFinanceQuery, nextGymOsPlanAction } from "./gym-os";

describe("GymOS Admin plan controls", () => {
  it("maps lifecycle states to non-destructive controls", () => {
    expect(nextGymOsPlanAction("DRAFT")).toBe("activate");
    expect(nextGymOsPlanAction("INACTIVE")).toBe("activate");
    expect(nextGymOsPlanAction("ACTIVE")).toBe("deactivate");
    expect(nextGymOsPlanAction("ARCHIVED")).toBe("none");
  });
  it("builds an encoded read-only attendance filter query", () => {
    expect(
      adminAttendanceQuery({ gymId: "gym-a", branchId: "branch-a", search: "A B" }),
    ).toBe(
      "/admin/gym-os/attendance?page=1&pageSize=100&gymId=gym-a&branchId=branch-a&search=A+B",
    );
  });
  it("builds read-only member-finance queries",()=>{expect(adminMemberFinanceQuery("payments",{gymId:"g",search:"A B"})).toBe("/admin/gym-os/finance/payments?page=1&pageSize=100&gymId=g&search=A+B");});
});
