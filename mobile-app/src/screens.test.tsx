import React, { type ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { State } from "./components/ui";
import { PlanScreen } from "./features/plans/PlanScreen";
import { SlotsScreen } from "./features/slots/SlotsScreen";
import { ReviewScreen } from "./features/bookings/ReviewScreen";
import { PaymentScreen } from "./features/payments/PaymentScreen";
import { BookingScreen } from "./features/bookings/BookingScreen";
import { ProfileScreen } from "./features/profile/ProfileScreen";
import { MobileApiError } from "./api/client";
import { ExploreScreen } from "./features/discovery/ExploreScreen";
import { BookingsScreen } from "./features/bookings/BookingsScreen";
import { CheckInScreen, secondsLeft } from "./features/check-in/CheckInScreen";
import { BookingReviewScreen } from "./features/reviews/BookingReviewScreen";
import { GymReviewsScreen } from "./features/reviews/GymReviewsScreen";
import { NotificationsScreen } from "./features/notifications/NotificationsScreen";

const mocks = vi.hoisted(() => ({
  query: {
    data: undefined as unknown,
    isLoading: false,
    error: null as unknown,
    refetch: vi.fn(),
    hasNextPage: true,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
  },
  mutation: {
    data: undefined as unknown,
    isPending: false,
    isSuccess: false,
    error: null as unknown,
    mutate: vi.fn(),
  },
  api: {
    reserve: vi.fn(),
    order: vi.fn(),
    verifyPayment: vi.fn(),
    checkInStatus: vi.fn(),
    checkInQr: vi.fn(),
    checkInOtp: vi.fn(),
  },
  invalidate: vi.fn(),
  logout: vi.fn(),
  uuid: vi.fn(() => "reservation-key"),
  options: {} as { mutationFn?: () => Promise<unknown> },
}));
vi.mock("react-native", () => ({
  ActivityIndicator: "Spinner",
  Pressable: "Button",
  ScrollView: "Scroll",
  Text: "Text",
  TextInput: "Input",
  View: "View",
  RefreshControl: "RefreshControl",
  StyleSheet: { create: (value: unknown) => value },
  Alert: { alert: vi.fn() },
  Linking: { openSettings: vi.fn() },
  FlatList: ({
    ListHeaderComponent,
    data,
    renderItem,
    ...rest
  }: {
    ListHeaderComponent?: React.ReactNode;
    refreshControl?: React.ReactNode;
    data: unknown[];
    renderItem: (input: { item: unknown }) => React.ReactNode;
  }) =>
    React.createElement(
      "List",
      Object.fromEntries(Object.entries(rest).filter(([key]) => key !== "refreshControl")),
      ListHeaderComponent,
      data.map((item, index) =>
        React.createElement(
          React.Fragment,
          { key: index },
          renderItem({ item }),
        ),
      ),
    ),
}));
vi.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ navigate: vi.fn() }),
}));
vi.mock("./features/discovery/useLocation", () => ({
  useDiscoveryLocation: () => ({
    status: "idle",
    coordinates: null,
    locate: vi.fn(),
    clear: vi.fn(),
  }),
}));
vi.mock("react-native-safe-area-context", () => ({ SafeAreaView: "SafeArea" }));
vi.mock("react-native-qrcode-svg", () => ({ default: "QRCode" }));
vi.mock("expo-crypto", () => ({ randomUUID: mocks.uuid }));
vi.mock("./features/notifications/push", () => ({ registerForPush: vi.fn(), unregisterPushOnLogout: vi.fn() }));
vi.mock("./store/session", () => ({
  useSession: () => ({
    api: mocks.api,
    logout: mocks.logout,
    updateUser: vi.fn(),
  }),
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: (options?: { queryKey?: unknown[] }) => options?.queryKey?.[0] === "notification-preferences" ? { ...mocks.query, data: [] } : mocks.query,
  useInfiniteQuery: () => mocks.query,
  useMutation: (options: typeof mocks.options) => {
    mocks.options = options;
    return mocks.mutation;
  },
  useQueryClient: () => ({ invalidateQueries: mocks.invalidate }),
}));

let tree: ReactTestRenderer;
async function render(element: React.ReactElement) {
  await act(async () => {
    tree = create(element);
  });
}
const text = () => JSON.stringify(tree.toJSON());
const button = (label: string) =>
  tree.root
    .findAllByType("Button" as React.ElementType)
    .find((node) => node.props.accessibilityLabel === label)!;
const selection = {
  gym: { name: "Actual Gym" },
  branch: { id: "branch", name: "Central", timezone: "Asia/Kolkata" },
  plan: {
    id: "plan",
    name: "Day pass",
    type: "DAY_PASS",
    status: "ACTIVE",
    priceMinor: 49900,
    currency: "INR",
    durationDays: 1,
  },
};
const booking = {
  id: "booking",
  gym: selection.gym,
  branch: selection.branch,
  planName: "Day pass",
  priceMinor: 49900,
  currency: "INR",
  status: "PAYMENT_PENDING",
  reservationExpiresAt: new Date(Date.now() + 600000).toISOString(),
  createdAt: new Date().toISOString(),
};
function props<T>(params: unknown): T {
  return {
    route: { params },
    navigation: { navigate: vi.fn(), replace: vi.fn() },
  } as T;
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  mocks.query.data = undefined;
  mocks.query.isLoading = false;
  mocks.query.error = null;
  mocks.mutation.error = null;
  mocks.mutation.data = undefined;
  mocks.mutation.isPending = false;
  mocks.mutation.isSuccess = false;
  vi.clearAllMocks();
});
afterEach(async () => {
  if (tree) await act(async () => tree.unmount());
});
describe("shared screen states", () => {
  it("renders discovery loading", async () => {
    mocks.query.isLoading = true;
    await render(<ExploreScreen />);
    expect(text()).toContain("Loading");
  });
  it("renders discovery empty results", async () => {
    mocks.query.data = { pages: [{ rows: [] }] };
    await render(<ExploreScreen />);
    expect(text()).toContain("Nothing here yet");
  });
  it("renders discovery API failure", async () => {
    mocks.query.error = new MobileApiError("HTTP_500", 500);
    await render(<ExploreScreen />);
    expect(text()).toContain("Try again");
  });
  it("renders real discovery results and requests next page", async () => {
    mocks.query.data = {
      pages: [
        {
          rows: [
            {
              id: "branch",
              gymId: "gym",
              name: "Server gym",
              description: "Central",
              amenities: "",
            },
          ],
        },
      ],
    };
    await render(<ExploreScreen />);
    expect(text()).toContain("Server gym");
    await act(async () =>
      tree.root.findByType("List" as React.ElementType).props.onEndReached(),
    );
    expect(mocks.query.fetchNextPage).toHaveBeenCalledOnce();
  });
  it("renders bookings with actual status", async () => {
    mocks.query.data = { pages: [{ data: [booking] }] };
    await render(<BookingsScreen />);
    expect(text()).toContain("PAYMENT PENDING");
    expect(text()).toContain("Upcoming");
  });
  it("renders an empty booking list", async () => {
    mocks.query.data = { pages: [{ data: [] }] };
    await render(<BookingsScreen />);
    expect(text()).toContain("Nothing here yet");
  });
  it("renders loading accessibly", async () => {
    await render(<State loading />);
    expect(text()).toContain("Loading");
  });
  it("renders empty state", async () => {
    await render(<State empty />);
    expect(text()).toContain("Nothing here yet");
  });
  it("sanitizes errors and offers retry", async () => {
    const retry = vi.fn();
    await render(<State error={new Error("secret stack")} retry={retry} />);
    expect(text()).not.toContain("secret stack");
    await act(async () => button("Try again").props.onPress());
    expect(retry).toHaveBeenCalledOnce();
  });
  it("explains capacity conflict", async () => {
    await render(<State error={new MobileApiError("SLOT_FULL", 409)} />);
    expect(text()).toContain("slot just filled");
  });
  it("explains offline failure", async () => {
    await render(<State error={new MobileApiError("NETWORK_UNAVAILABLE")} />);
    expect(text()).toContain("offline");
  });
});
describe("plans, slots and review", () => {
  it("renders real active plan price", async () => {
    await render(
      <PlanScreen {...props<ComponentProps<typeof PlanScreen>>(selection)} />,
    );
    expect(text()).toContain("499.00");
    expect(button("Choose a date and slot").props.disabled).toBe(false);
  });
  it("does not book inactive plans", async () => {
    await render(
      <PlanScreen
        {...props<ComponentProps<typeof PlanScreen>>({
          ...selection,
          plan: { ...selection.plan, status: "INACTIVE" },
        })}
      />,
    );
    expect(button("Choose a date and slot").props.disabled).toBe(true);
  });
  it("disables unavailable server slots", async () => {
    mocks.query.data = [
      {
        id: "slot",
        startAt: "2026-09-16T03:30:00Z",
        endAt: "2026-09-16T04:30:00Z",
        available: 0,
        status: "FULL",
      },
    ];
    await render(
      <SlotsScreen {...props<ComponentProps<typeof SlotsScreen>>(selection)} />,
    );
    expect(button("Unavailable").props.disabled).toBe(true);
    expect(text()).toContain("Asia/Kolkata");
  });
  it("renders slot API errors", async () => {
    mocks.query.error = new MobileApiError("HTTP_500", 500);
    await render(
      <SlotsScreen {...props<ComponentProps<typeof SlotsScreen>>(selection)} />,
    );
    expect(text()).toContain("Try again");
  });
  it("reserves with only identifiers and a stable retry key", async () => {
    mocks.api.reserve.mockResolvedValue(booking);
    await render(
      <ReviewScreen
        {...props<ComponentProps<typeof ReviewScreen>>(selection)}
      />,
    );
    expect(text()).toContain("Actual Gym");
    await mocks.options.mutationFn!();
    await mocks.options.mutationFn!();
    expect(mocks.api.reserve).toHaveBeenNthCalledWith(
      2,
      { branchId: "branch", planId: "plan" },
      "reservation-key",
    );
    expect(mocks.uuid).toHaveBeenCalledOnce();
  });
});
describe("authoritative payment and booking screens", () => {
  it("never shows confirmation while backend is pending", async () => {
    mocks.query.data = booking;
    await render(
      <PaymentScreen
        {...props<ComponentProps<typeof PaymentScreen>>({
          bookingId: "booking",
        })}
      />,
    );
    expect(text()).not.toContain("Your workout is confirmed");
    expect(button("Continue to payment").props.disabled).toBe(false);
  });
  it("shows confirmation only from backend status", async () => {
    mocks.query.data = { ...booking, status: "CONFIRMED" };
    await render(
      <PaymentScreen
        {...props<ComponentProps<typeof PaymentScreen>>({
          bookingId: "booking",
        })}
      />,
    );
    expect(text()).toContain("Your workout is confirmed");
    expect(button("Continue to payment")).toBeUndefined();
  });
  it("does not mutate status at the reservation deadline", async () => {
    mocks.query.data = {
      ...booking,
      reservationExpiresAt: "2020-01-01T00:00:00Z",
    };
    await render(
      <PaymentScreen
        {...props<ComponentProps<typeof PaymentScreen>>({
          bookingId: "booking",
        })}
      />,
    );
    expect(button("Continue to payment").props.disabled).toBe(true);
    expect(mocks.query.refetch).toHaveBeenCalled();
    expect(mocks.query.data).toHaveProperty("status", "PAYMENT_PENDING");
  });
  it("development checkout has no customer success bypass", async () => {
    mocks.query.data = booking;
    mocks.api.order.mockResolvedValue({ provider: "development" });
    await render(
      <PaymentScreen
        {...props<ComponentProps<typeof PaymentScreen>>({
          bookingId: "booking",
        })}
      />,
    );
    await act(async () => {
      await mocks.options.mutationFn!();
    });
    expect(text()).toContain("no money is charged");
    expect(mocks.api.verifyPayment).not.toHaveBeenCalled();
  });
  it("displays payment and customer-safe refund status", async () => {
    mocks.query.data = {
      ...booking,
      status: "REFUNDED",
      payment: {
        status: "REFUNDED",
        refunds: [{ id: "refund", amount: 49900, status: "SUCCESS" }],
      },
    };
    await render(
      <BookingScreen
        {...props<ComponentProps<typeof BookingScreen>>({
          bookingId: "booking",
        })}
      />,
    );
    expect(text()).toContain("SUCCESS");
    expect(button("Continue payment")).toBeUndefined();
    expect(text()).not.toContain("commission");
  });
  it("renders profile and logout action", async () => {
    mocks.query.data = { phone: "+919876543212", firstName: "Customer" };
    await render(<ProfileScreen />);
    expect(text()).toContain("Customer");
    await act(async () => button("Log out").props.onPress());
    expect(mocks.logout).toHaveBeenCalledOnce();
  });
});
describe("secure check-in screen", () => {
  const checkInContext = {
    planName: "Day pass",
    gym: { id: "gym", name: "Actual Gym" },
    branch: {
      id: "branch",
      name: "Central",
      city: "Bengaluru",
      timezone: "Asia/Kolkata",
    },
    slot: null,
  };
  it("shows pre-window guidance without generating a credential", async () => {
    mocks.query.data = {
      ...checkInContext,
      bookingId: "booking",
      bookingStatus: "CONFIRMED",
      eligible: false,
      window: {
        opensAt: "2026-09-17T09:45:00Z",
        closesAt: "2026-09-17T10:30:00Z",
      },
      checkIn: null,
    };
    await render(
      <CheckInScreen
        {...props<ComponentProps<typeof CheckInScreen>>({
          bookingId: "booking",
        })}
      />,
    );
    expect(text()).toContain("becomes available");
    expect(button("Generate secure QR")).toBeUndefined();
  });
  it("offers QR and OTP only when the backend marks the booking eligible", async () => {
    mocks.query.data = {
      ...checkInContext,
      bookingId: "booking",
      bookingStatus: "CHECK_IN_AVAILABLE",
      eligible: true,
      window: null,
      checkIn: { status: "AVAILABLE" },
    };
    await render(
      <CheckInScreen
        {...props<ComponentProps<typeof CheckInScreen>>({
          bookingId: "booking",
        })}
      />,
    );
    expect(button("Generate secure QR")).toBeDefined();
    expect(button("Use fallback OTP")).toBeDefined();
    await act(async () => button("Generate secure QR").props.onPress());
    expect(mocks.mutation.mutate).toHaveBeenCalled();
  });
  it("renders an in-memory QR countdown and permits regeneration", async () => {
    mocks.query.data = {
      ...checkInContext,
      bookingId: "booking",
      bookingStatus: "CHECK_IN_AVAILABLE",
      eligible: true,
      window: null,
      checkIn: { status: "AVAILABLE" },
    };
    mocks.mutation.data = {
      token: "opaque-server-issued-token",
      expiresAt: new Date(Date.now() + 120_000).toISOString(),
    };
    await render(
      <CheckInScreen
        {...props<ComponentProps<typeof CheckInScreen>>({
          bookingId: "booking",
        })}
      />,
    );
    expect(text()).toContain("Secure check-in QR code");
    await act(async () => button("Regenerate QR").props.onPress());
    expect(mocks.mutation.mutate).toHaveBeenCalled();
  });
  it("discards an expired QR from display", async () => {
    expect(
      secondsLeft("2026-09-17T10:00:00Z", Date.parse("2026-09-17T10:00:01Z")),
    ).toBe(0);
  });
  it("renders the server-authoritative checked-in state", async () => {
    mocks.query.data = {
      ...checkInContext,
      bookingId: "booking",
      bookingStatus: "CHECKED_IN",
      eligible: false,
      window: null,
      checkIn: {
        status: "VERIFIED",
        method: "QR",
        verifiedAt: new Date().toISOString(),
      },
    };
    await render(
      <CheckInScreen
        {...props<ComponentProps<typeof CheckInScreen>>({
          bookingId: "booking",
        })}
      />,
    );
    expect(text()).toContain("CHECKED IN");
    expect(button("Refresh status")).toBeDefined();
  });
  it("renders completion and network retry states", async () => {
    mocks.query.data = {
      ...checkInContext,
      bookingId: "booking",
      bookingStatus: "COMPLETED",
      eligible: false,
      window: null,
      checkIn: { status: "COMPLETED" },
    };
    await render(
      <CheckInScreen
        {...props<ComponentProps<typeof CheckInScreen>>({
          bookingId: "booking",
        })}
      />,
    );
    expect(text()).toContain("COMPLETED");
    await act(async () => tree.unmount());
    mocks.query.data = undefined;
    mocks.query.error = new MobileApiError("NETWORK_UNAVAILABLE");
    await render(
      <CheckInScreen
        {...props<ComponentProps<typeof CheckInScreen>>({
          bookingId: "booking",
        })}
      />,
    );
    expect(text()).toContain("offline");
    expect(button("Try again")).toBeDefined();
  });
  it("integrates check-in navigation into eligible booking details", async () => {
    mocks.query.data = { ...booking, status: "CHECK_IN_AVAILABLE" };
    const screenProps = props<ComponentProps<typeof BookingScreen>>({
      bookingId: "booking",
    });
    await render(<BookingScreen {...screenProps} />);
    await act(async () => button("Check-in details").props.onPress());
    expect(screenProps.navigation.navigate).toHaveBeenCalledWith("CheckIn", {
      bookingId: "booking",
    });
  });
});

describe("Phase 8 reviews and notifications", () => {
  const completed = { ...booking, status: "COMPLETED", gymId: "gym", branch: { id: "branch", name: "Central" }, review: null };
  it("shows review action only after completed use", async () => {
    mocks.query.data = { ...booking, status: "NO_SHOW" };
    await render(<BookingScreen {...props<ComponentProps<typeof BookingScreen>>({ bookingId: "booking" })} />);
    expect(button("Leave a review")).toBeUndefined();
    mocks.query.data = completed;
    await render(<BookingScreen {...props<ComponentProps<typeof BookingScreen>>({ bookingId: "booking" })} />);
    expect(button("Leave a review")).toBeDefined();
  });
  it("validates rating before submission and supports editing", async () => {
    mocks.query.data = completed;
    await render(<BookingReviewScreen {...props<ComponentProps<typeof BookingReviewScreen>>({ bookingId: "booking" })} />);
    expect(button("Submit review").props.disabled).toBe(true);
    await act(async () => button("5 stars").props.onPress());
    expect(button("Submit review").props.disabled).toBe(false);
    mocks.query.data = { ...completed, review: { id: "review", rating: 4, title: "Good", comment: "Nice", status: "PUBLISHED" } };
    await render(<BookingReviewScreen {...props<ComponentProps<typeof BookingReviewScreen>>({ bookingId: "booking" })} />);
    expect(button("Save review")).toBeDefined();
    expect(text()).toContain("Good");
  });
  it("renders real gym review aggregates and an empty state", async () => {
    mocks.query.data = { data: [], aggregate: { averageRating: null, reviewCount: 0 }, meta: { hasNextPage: false } };
    await render(<GymReviewsScreen {...props<ComponentProps<typeof GymReviewsScreen>>({ gymId: "gym" })} />);
    expect(text()).toContain("No ratings yet");
    mocks.query.data = { data: [{ id: "review", rating: 5, reviewerName: "Member", comment: "Great gym", createdAt: new Date().toISOString() }], aggregate: { averageRating: 5, reviewCount: 1 }, meta: { hasNextPage: false } };
    await render(<GymReviewsScreen {...props<ComponentProps<typeof GymReviewsScreen>>({ gymId: "gym" })} />);
    expect(text()).toContain("Great gym");
    expect(text()).toContain("5.0 / 5");
  });
  it("renders Notification Center loading, error, empty, and read-all states", async () => {
    mocks.query.isLoading = true;
    await render(<NotificationsScreen {...props<ComponentProps<typeof NotificationsScreen>>({})} />);
    expect(text()).toContain("Loading");
    mocks.query.isLoading = false;
    mocks.query.error = new MobileApiError("NETWORK_UNAVAILABLE");
    await render(<NotificationsScreen {...props<ComponentProps<typeof NotificationsScreen>>({})} />);
    expect(text()).toContain("offline");
    mocks.query.error = null;
    mocks.query.data = { pages: [{ data: [] }] };
    await render(<NotificationsScreen {...props<ComponentProps<typeof NotificationsScreen>>({})} />);
    expect(text()).toContain("Nothing here yet");
    mocks.query.data = { pages: [{ data: [{ id: "notice", title: "Booking confirmed", body: "Your visit is confirmed", createdAt: new Date().toISOString(), readAt: null, data: null }] }] };
    await render(<NotificationsScreen {...props<ComponentProps<typeof NotificationsScreen>>({})} />);
    expect(text()).toContain("Booking confirmed");
    await act(async () => button("Mark all read").props.onPress());
    expect(mocks.mutation.mutate).toHaveBeenCalled();
  });
});
