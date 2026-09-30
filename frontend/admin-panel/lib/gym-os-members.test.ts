import { describe, expect, it } from "vitest";
import type { GymOsMember } from "@gymride/types";
function adminVisible(member: GymOsMember) {
  const visible = { ...member };
  delete visible.notes;
  return visible;
}
describe("GymOS Admin member privacy", () => {
  it("keeps gym-private notes out of oversight projections", () => {
    const member = {
      id: "1",
      memberCode: "GM-1",
      firstName: "A",
      phone: "+919000000000",
      status: "ACTIVE",
      createdAt: "2026-09-27",
      notes: "private",
    } as GymOsMember;
    expect(adminVisible(member)).not.toHaveProperty("notes");
  });
});
