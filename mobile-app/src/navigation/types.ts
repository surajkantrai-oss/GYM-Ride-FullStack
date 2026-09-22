import type {
  GymPlan,
  PublicBranch,
  PublicGym,
  SlotAvailability,
} from "@gymride/types";
export type Selection = { gym: PublicGym; branch: PublicBranch; plan: GymPlan };
export type RootStack = {
  Main: { screen: "Home" | "Explore" | "Bookings" | "Profile" } | undefined;
  Gym: { gymId: string };
  Plan: Selection;
  Slots: Selection;
  Review: Selection & { slot?: SlotAvailability };
  Payment: { bookingId: string };
  Booking: { bookingId: string };
  CheckIn: { bookingId: string };
  BookingReview: { bookingId: string };
  GymReviews: { gymId: string; branchId?: string };
  Notifications: undefined;
};
