export type RoleName =
  | "SUPER_ADMIN"
  | "ADMIN"
  | "GYM_OWNER"
  | "GYM_MANAGER"
  | "GYM_STAFF"
  | "CUSTOMER";
export type GymStatus =
  "DRAFT" | "PENDING_APPROVAL" | "APPROVED" | "REJECTED" | "SUSPENDED";
export type BranchStatus = "DRAFT" | "ACTIVE" | "INACTIVE" | "SUSPENDED";
export type Weekday =
  | "MONDAY"
  | "TUESDAY"
  | "WEDNESDAY"
  | "THURSDAY"
  | "FRIDAY"
  | "SATURDAY"
  | "SUNDAY";

export interface UserProfile {
  id: string;
  phone: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  roles: RoleName[];
}

export interface Tokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResponse {
  user: UserProfile;
  tokens: Tokens;
}

export interface Amenity {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
}

export interface OperatingHoursPeriod {
  id?: string;
  weekday: Weekday;
  period?: number;
  isClosed: boolean;
  opensAt?: string | null;
  closesAt?: string | null;
}

export interface GymBranch {
  id: string;
  gymId: string;
  name: string;
  address: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  latitude: number | string;
  longitude: number | string;
  status: BranchStatus;
  timezone: string;
  phone?: string | null;
  email?: string | null;
  amenities?: Array<Amenity | { amenity: Amenity }>;
  operatingHours?: OperatingHoursPeriod[];
}

export interface GymSummary {
  id: string;
  name: string;
  description?: string | null;
  status: GymStatus;
  statusReason?: string | null;
  owner?: Pick<
    UserProfile,
    "id" | "phone" | "firstName" | "lastName" | "email"
  >;
  branches?: GymBranch[];
  createdAt?: string;
  updatedAt?: string;
}

export interface PageMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: PageMeta;
}

export interface DashboardSummary {
  totalGyms: number;
  totalBranches?: number;
  statuses: Partial<Record<GymStatus, number>>;
}

export interface AuditRecord {
  id: string;
  action: string;
  reason?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
  actor?: Pick<UserProfile, "id" | "phone" | "firstName" | "lastName"> | null;
}

export interface BackendErrorBody {
  statusCode?: number;
  message?: string | string[];
  error?: string | { code?: string; message?: string; details?: unknown };
  requestId?: string;
}

export type PlanType = "DAY_PASS" | "MONTHLY" | "QUARTERLY" | "YEARLY";
export type PlanStatus = "DRAFT" | "ACTIVE" | "INACTIVE" | "ARCHIVED";
export type SlotStatus = "AVAILABLE" | "BLOCKED" | "CLOSED";
export type BookingStatus =
  | "CREATED"
  | "PAYMENT_PENDING"
  | "CONFIRMED"
  | "CHECK_IN_AVAILABLE"
  | "CHECKED_IN"
  | "COMPLETED"
  | "CANCELLED"
  | "EXPIRED"
  | "NO_SHOW"
  | "PAYMENT_FAILED"
  | "REFUNDED";

export interface GymPlan {
  id: string;
  gymId: string;
  name: string;
  description?: string | null;
  type: PlanType;
  priceMinor: number;
  currency: "INR";
  durationDays: number;
  visitLimit?: number | null;
  status: PlanStatus;
  createdAt: string;
  updatedAt: string;
  branches: Array<{
    branch: Pick<GymBranch, "id" | "name" | "city" | "status">;
  }>;
}

export interface SlotConfig {
  id?: string;
  branchId?: string;
  slotDurationMinutes: number;
  defaultCapacity: number;
  bookingWindowDays: number;
  minimumAdvanceMinutes: number;
  isActive: boolean;
}

export interface SlotAvailability {
  id: string;
  startAt: string;
  endAt: string;
  capacity: number;
  reserved: number;
  confirmed: number;
  available: number;
  status: SlotStatus;
}

export interface BookingEvent {
  id: string;
  type: string;
  fromStatus?: BookingStatus | null;
  toStatus: BookingStatus;
  createdAt: string;
}

export type CheckInMethod = "QR" | "OTP";
export type CheckInStatus = "AVAILABLE" | "VERIFIED" | "COMPLETED" | "EXPIRED";
export interface BookingCheckIn {
  id: string;
  status: CheckInStatus;
  method?: CheckInMethod | null;
  verifiedAt?: string | null;
  completedAt?: string | null;
  verifiedBy?: Pick<UserProfile, "id" | "firstName" | "lastName"> | null;
}
export interface CheckInWindow {
  opensAt: string;
  closesAt: string;
  completesAt: string;
  noShowAt: string;
}
export interface CheckInStatusResponse {
  bookingId: string;
  bookingStatus: BookingStatus;
  planName: string;
  gym: { id: string; name: string };
  branch: Pick<GymBranch, "id" | "name" | "city" | "timezone">;
  slot: { id: string; startAt: string; endAt: string } | null;
  eligible: boolean;
  window: CheckInWindow | null;
  checkIn: Omit<BookingCheckIn, "verifiedBy"> | null;
}
export interface CheckInQrCredential {
  token: string;
  expiresAt: string;
}
export interface CheckInOtpCredential {
  bookingId: string;
  code: string;
  expiresAt: string;
}
export interface CheckInVerificationResult extends Booking {}

export interface Booking {
  id: string;
  userId: string;
  gymId: string;
  branchId: string;
  planId: string;
  slotId?: string | null;
  status: BookingStatus;
  planName: string;
  planType: PlanType;
  priceMinor: number;
  currency: string;
  reservationExpiresAt?: string | null;
  cancelledAt?: string | null;
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  user: Pick<UserProfile, "id" | "firstName" | "lastName">;
  gym: { id: string; name: string };
  branch: { id: string; name: string; city: string; timezone?: string };
  payment?: {
    id: string;
    status: string;
    amount: number;
    currency: string;
    refundedAmount: number;
    refunds: Array<{
      id: string;
      amount: number;
      status: string;
      createdAt: string;
    }>;
  } | null;
  slot?: { id: string; startAt: string; endAt: string } | null;
  events?: BookingEvent[];
  checkIn?: BookingCheckIn | null;
  review?: Pick<MyReview, 'id' | 'rating' | 'title' | 'comment' | 'status' | 'createdAt' | 'editedAt'> | null;
}

export type PublicBranch = Pick<
  GymBranch,
  | "id"
  | "name"
  | "address"
  | "city"
  | "state"
  | "postalCode"
  | "country"
  | "latitude"
  | "longitude"
  | "timezone"
  | "phone"
  | "email"
  | "amenities"
  | "operatingHours"
>;
export interface PublicGym {
  id: string;
  name: string;
  description: string | null;
  branches: PublicBranch[];
  averageRating?: number | null;
  reviewCount?: number;
}
export interface NearbyGym {
  gymId: string;
  gymName: string;
  branch: Pick<PublicBranch, "id" | "name" | "city" | "latitude" | "longitude">;
  distanceMeters: number;
  amenities: string[];
  averageRating?: number | null;
  reviewCount?: number;
}

export type ReviewStatus = 'PUBLISHED' | 'HIDDEN' | 'REMOVED';
export interface GymReview {
  id: string;
  gymId: string;
  branchId: string;
  rating: number;
  title: string | null;
  comment: string | null;
  reviewerName: string;
  createdAt: string;
  editedAt: string | null;
}
export interface MyReview extends Omit<GymReview, 'reviewerName'> {
  bookingId: string;
  customerId: string;
  status: ReviewStatus;
}
export interface GymReviewPage extends PaginatedResponse<GymReview> {
  aggregate: { averageRating: number | null; reviewCount: number };
}

export type NotificationRoute =
  | { screen: 'Booking' | 'CheckIn' | 'BookingReview'; bookingId: string }
  | { screen: 'Gym' | 'PartnerReviews'; gymId: string }
  | { screen: 'PartnerSettlement'; settlementId: string };
export interface InAppNotification {
  id: string;
  type: string;
  category: string;
  title: string;
  body: string;
  data: NotificationRoute | null;
  readAt: string | null;
  createdAt: string;
}
export interface NotificationPreference {
  category: 'BOOKING' | 'PAYMENT' | 'CHECK_IN' | 'REFUND' | 'REVIEW' | 'SETTLEMENT' | 'MARKETING';
  inAppEnabled: boolean;
  pushEnabled: boolean;
}
export interface NearbyGymsResponse {
  data: NearbyGym[];
  meta: { page: number; limit: number; hasMore: boolean };
}
export interface CustomerPaymentOrder {
  id: string;
  bookingId: string;
  provider: string;
  orderId: string;
  amount: number;
  currency: string;
  status: string;
  simulated: boolean;
  keyId?: string;
}
