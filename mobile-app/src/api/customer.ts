import type {
  AuthResponse,
  Booking,
  CheckInOtpCredential,
  CheckInQrCredential,
  CheckInStatusResponse,
  CustomerPaymentOrder,
  GymPlan,
  GymReviewPage,
  MyReview,
  InAppNotification,
  NotificationPreference,
  NearbyGymsResponse,
  PaginatedResponse,
  PublicGym,
  SlotAvailability,
  UserProfile,
  ServiceCity,
  FlexPlan,
  FlexCheckout,
  FlexSubscription,
  FlexEligibleGym,
  RecommendationResponse,
  CustomerGymPreference,
} from "@gymride/types";
import type { MobileApiClient } from "./client";
export interface ReservationInput {
  branchId: string;
  planId: string;
  slotId?: string;
}
export function customerApi(client: MobileApiClient) {
  const post = (body: unknown): RequestInit => ({
    method: "POST",
    body: JSON.stringify(body),
  });
  return {
    requestOtp: (phone: string) =>
      client.request<{ developmentOtp?: string; expiresIn: number }>(
        "/auth/otp/request",
        post({ phone }),
        false,
      ),
    verifyOtp: (phone: string, otp: string) =>
      client.request<AuthResponse>(
        "/auth/otp/verify",
        post({ phone, otp, deviceName: "GYMRide customer app" }),
        false,
      ),
    me: () => client.request<UserProfile>("/users/me"),
    updateProfile: (input: {
      firstName?: string;
      lastName?: string;
      email?: string;
    }) =>
      client.request<UserProfile>("/users/me", {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    gyms: (query: string) =>
      client.request<PaginatedResponse<PublicGym>>(`/gyms?${query}`),
    nearby: (query: string) =>
      client.request<NearbyGymsResponse>(`/gyms/nearby?${query}`),
    recommendations: (query: string) => client.request<RecommendationResponse>(`/recommendations/gyms?${query}`),
    gymPreferences: () => client.request<CustomerGymPreference | null>("/users/me/gym-preferences"),
    updateGymPreferences: (input: Partial<CustomerGymPreference>) => client.request<CustomerGymPreference>("/users/me/gym-preferences", { method: "PATCH", body: JSON.stringify(input) }),
    gym: (id: string) =>
      client.request<PublicGym>(`/gyms/${encodeURIComponent(id)}`),
    gymReviews: (id: string, page = 1, branchId?: string) =>
      client.request<GymReviewPage>(`/gyms/${encodeURIComponent(id)}/reviews?${new URLSearchParams({ page: String(page), limit: '20', ...(branchId && { branchId }) })}`),
    plans: (branchId: string) =>
      client.request<GymPlan[]>(
        `/branches/${encodeURIComponent(branchId)}/plans`,
      ),
    slots: (branchId: string, date: string, planId: string) =>
      client.request<SlotAvailability[]>(
        `/branches/${encodeURIComponent(branchId)}/availability?${new URLSearchParams({ date, planId })}`,
      ),
    reserve: (input: ReservationInput, key: string) =>
      client.request<Booking>("/bookings", {
        ...post(input),
        headers: { "Idempotency-Key": key },
      }),
    bookings: (page: number) =>
      client.request<PaginatedResponse<Booking>>(
        `/bookings?page=${page}&limit=20`,
      ),
    booking: (id: string) =>
      client.request<Booking>(`/bookings/${encodeURIComponent(id)}`),
    myReview: (bookingId: string) =>
      client.request<MyReview>(`/bookings/${encodeURIComponent(bookingId)}/review`),
    createReview: (bookingId: string, input: { rating: number; title?: string; comment?: string }) =>
      client.request<MyReview>(`/bookings/${encodeURIComponent(bookingId)}/review`, post(input)),
    editReview: (bookingId: string, input: { rating: number; title?: string; comment?: string }) =>
      client.request<MyReview>(`/bookings/${encodeURIComponent(bookingId)}/review`, { method: 'PATCH', body: JSON.stringify(input) }),
    notifications: (page = 1) => client.request<PaginatedResponse<InAppNotification>>(`/notifications?page=${page}&limit=20`),
    unreadCount: () => client.request<{ count: number }>('/notifications/unread-count'),
    markNotificationRead: (id: string) => client.request<{ id: string; readAt: string }>(`/notifications/${encodeURIComponent(id)}/read`, { method: 'PATCH' }),
    markAllNotificationsRead: () => client.request<{ updated: number }>('/notifications/read-all', post({})),
    notificationPreferences: () => client.request<NotificationPreference[]>('/notifications/preferences'),
    updateNotificationPreference: (input: Partial<NotificationPreference> & Pick<NotificationPreference, 'category'>) =>
      client.request<NotificationPreference>('/notifications/preferences', { method: 'PATCH', body: JSON.stringify(input) }),
    registerPushDevice: (input: { platform: 'ios' | 'android'; token: string; deviceId?: string }) =>
      client.request<{ id: string; enabled: boolean }>('/notifications/devices', post(input)),
    unregisterPushDevice: (id: string) => client.request<{ disabled: boolean }>(`/notifications/devices/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    checkInStatus: (id: string) =>
      client.request<CheckInStatusResponse>(
        `/bookings/${encodeURIComponent(id)}/check-in`,
      ),
    checkInQr: (id: string) =>
      client.request<CheckInQrCredential>(
        `/bookings/${encodeURIComponent(id)}/check-in/qr`,
        post({}),
      ),
    checkInOtp: (id: string) =>
      client.request<CheckInOtpCredential>(
        `/bookings/${encodeURIComponent(id)}/check-in/otp`,
        post({}),
      ),
    cancel: (id: string) =>
      client.request<Booking>(
        `/bookings/${encodeURIComponent(id)}/cancel`,
        post({}),
      ),
    order: (bookingId: string) =>
      client.request<CustomerPaymentOrder>(
        `/bookings/${encodeURIComponent(bookingId)}/payment`,
        post({}),
      ),
    verifyPayment: (
      paymentId: string,
      proof: { orderId: string; paymentId: string; signature: string },
    ) =>
      client.request(
        `/payments/${encodeURIComponent(paymentId)}/verify`,
        post(proof),
      ),
    flexCities: () => client.request<ServiceCity[]>("/flex/cities"),
    flexPlans: () => client.request<FlexPlan[]>("/flex/plans"),
    flexSubscription: () => client.request<FlexSubscription | null>("/flex/subscription"),
    flexGyms: (cityId?: string) => client.request<FlexEligibleGym[]>(`/flex/gyms${cityId ? `?cityId=${encodeURIComponent(cityId)}` : ""}`),
    purchaseFlex: (input: { planId: string; primaryCityId: string; secondaryCityId?: string }, key: string) => client.request<FlexCheckout>("/flex/subscriptions", { ...post(input), headers: { "Idempotency-Key": key } }),
    simulateFlexPayment: (paymentId: string) => client.request<FlexSubscription>(`/flex/payments/${encodeURIComponent(paymentId)}/simulate`, post({})),
    flexBooking: (input: { branchId: string; planId: string; slotId: string }, key: string) => client.request<Booking>("/flex/bookings", { ...post(input), headers: { "Idempotency-Key": key } }),
  };
}
export type CustomerApi = ReturnType<typeof customerApi>;
