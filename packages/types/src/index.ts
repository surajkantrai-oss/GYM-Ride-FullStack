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

export type GymOsPlanStatus = "DRAFT" | "ACTIVE" | "INACTIVE" | "ARCHIVED";
export type GymOsSubscriptionStatus =
  | "TRIALING"
  | "PENDING_PAYMENT"
  | "ACTIVE"
  | "PAST_DUE"
  | "CANCELLED"
  | "EXPIRED"
  | "SUSPENDED";
export type GymOsFeature =
  | "MEMBERS"
  | "MEMBERSHIP_MANAGEMENT"
  | "ATTENDANCE"
  | "RENEWALS"
  | "DUES"
  | "REPORTS"
  | "STAFF"
  | "REMINDERS"
  | "CRM"
  | "MULTI_BRANCH";
export interface GymOsPlan {
  id: string;
  code: string;
  name: string;
  description: string;
  status: GymOsPlanStatus;
  billingInterval: "MONTHLY" | "YEARLY";
  priceMinor: number;
  currency: string;
  trialDays: number;
  memberLimit: number;
  branchLimit: number;
  displayOrder: number;
  features: Array<{ feature: GymOsFeature }>;
}
export interface GymOsSubscription {
  id: string;
  gymId: string;
  planId: string;
  status: GymOsSubscriptionStatus;
  billingInterval: "MONTHLY" | "YEARLY";
  planCodeSnapshot: string;
  planNameSnapshot: string;
  priceMinorSnapshot: number;
  currencySnapshot: string;
  memberLimitSnapshot: number;
  branchLimitSnapshot: number;
  featuresSnapshot: GymOsFeature[];
  currentPeriodStart?: string | null;
  currentPeriodEnd?: string | null;
  trialStart?: string | null;
  trialEnd?: string | null;
  cancelAtPeriodEnd: boolean;
  suspensionReason?: string | null;
  createdAt: string;
  payment?: {
    id: string;
    status: string;
    providerOrderId?: string | null;
  } | null;
  gym?: { id: string; name: string };
  plan?: GymOsPlan;
}
export interface GymOsEntitlements {
  gymId: string;
  subscribed: boolean;
  subscriptionStatus?: GymOsSubscriptionStatus | "EXPIRED";
  plan?: { code: string; name: string };
  period?: { start?: string | null; end?: string | null };
  limits?: { members: number; branches: number } | null;
  features: GymOsFeature[];
}

export type GymOsMembershipPlanStatus =
  "DRAFT" | "ACTIVE" | "INACTIVE" | "ARCHIVED";
export type GymOsMembershipDurationType = "DAYS" | "WEEKS" | "MONTHS";
export type GymOsMembershipStatus =
  "SCHEDULED" | "ACTIVE" | "FROZEN" | "EXPIRED" | "CANCELLED";
export interface GymOsMembershipPlan {
  id: string;
  gymId: string;
  code: string;
  name: string;
  description?: string | null;
  durationValue: number;
  durationType: GymOsMembershipDurationType;
  priceMinor: number;
  currency: string;
  status: GymOsMembershipPlanStatus;
  branches: Array<{
    branchId: string;
    branch?: Pick<GymBranch, "id" | "name" | "city">;
  }>;
  createdAt: string;
  updatedAt: string;
  gym?: Pick<GymSummary, "id" | "name">;
}
export interface GymOsMembershipEvent {
  id: string;
  type: string;
  reason?: string | null;
  metadata?: Record<string, unknown> | null;
  occurredAt: string;
}
export interface GymOsMembership {
  id: string;
  gymId: string;
  memberId: string;
  membershipPlanId?: string | null;
  status: GymOsMembershipStatus;
  startDate: string;
  endDate: string;
  planCodeSnapshot: string;
  planNameSnapshot: string;
  durationValueSnapshot: number;
  durationTypeSnapshot: GymOsMembershipDurationType;
  priceMinorSnapshot: number;
  currencySnapshot: string;
  branchIdsSnapshot: string[];
  freezeStartedAt?: string | null;
  totalFrozenDays: number;
  daysRemaining?: number;
  cancellationReason?: string | null;
  renewedFromMembershipId?: string | null;
  createdAt: string;
  member?: Pick<
    GymOsMember,
    "id" | "memberCode" | "firstName" | "lastName" | "phone"
  >;
  gym?: Pick<GymSummary, "id" | "name">;
  events?: GymOsMembershipEvent[];
}
export interface GymOsMembershipExpirySummary {
  expired: number;
  today: number;
  in1Day: number;
  in2Days: number;
  in3Days: number;
  within7Days: number;
  thisMonth: number;
  active: number;
  frozen: number;
  scheduled: number;
  cancelled: number;
  statuses: Partial<Record<GymOsMembershipStatus, number>>;
}
export type GymOsAttendanceStatus = "CHECKED_IN" | "CHECKED_OUT";
export type GymOsAttendanceMethod = "MANUAL" | "QR";
export interface GymOsAttendance {
  id: string;
  gymId: string;
  branchId: string;
  memberId: string;
  membershipId: string;
  status: GymOsAttendanceStatus;
  checkInAt: string;
  checkOutAt?: string | null;
  checkInMethod: GymOsAttendanceMethod;
  checkOutMethod?: GymOsAttendanceMethod | null;
  durationMinutes: number;
  member?: Pick<
    GymOsMember,
    "id" | "memberCode" | "firstName" | "lastName" | "phone"
  >;
  branch?: Pick<GymBranch, "id" | "name" | "timezone">;
  membership?: { id: string; planNameSnapshot: string };
  gym?: Pick<GymSummary, "id" | "name">;
}
export interface GymOsAttendanceSummary {
  todayCheckIns: number;
  currentlyPresent: number;
  checkOutsToday: number;
  uniqueMembersToday: number;
  last7DaysCount: number;
  last30DaysCount: number;
}

export type GymOsMemberChargeStatus =
  "UNPAID" | "PARTIALLY_PAID" | "PAID" | "VOID";
export type GymOsMemberPaymentStatus = "RECORDED" | "REVERSED";
export type GymOsMemberPaymentMethod =
  "CASH" | "UPI" | "CARD" | "BANK_TRANSFER" | "CHEQUE" | "OTHER";
export type GymOsReminderType =
  | "MEMBERSHIP_EXPIRING"
  | "MEMBERSHIP_EXPIRED"
  | "PAYMENT_DUE"
  | "PAYMENT_OVERDUE"
  | "INACTIVITY";
export type GymOsReminderChannel = "WHATSAPP" | "SMS" | "EMAIL";
export type GymOsReminderDeliveryStatus =
  "SCHEDULED" | "PROCESSING" | "SENT" | "FAILED" | "SKIPPED" | "CANCELLED";
export type GymOsAnalyticsRange =
  | "TODAY"
  | "LAST_7_DAYS"
  | "LAST_30_DAYS"
  | "THIS_MONTH"
  | "LAST_MONTH"
  | "CUSTOM";
export interface GymOsAnalyticsOverview {
  period: {
    range: GymOsAnalyticsRange;
    fromLocal: string;
    toLocal: string;
    timezone: string;
  };
  activeMembers: number;
  activeMemberships: number;
  scheduledMemberships: number;
  frozenMemberships: number;
  expiredMemberships: number;
  cancelledMemberships: number;
  expiringIn7Days: number;
  renewalsThisMonth: number;
  todayAttendance: number;
  uniqueVisitors30Days: number;
  collectionsThisMonthMinor: number;
  outstandingMinor: number;
  overdueMinor: number;
  paymentMethods: Array<{
    method: string;
    _sum: { amountMinor: number | null };
    _count: number;
  }>;
  attendance: {
    busiestDayOfWeek: { weekday: number; count: number } | null;
    busiestHour: { hour: number; count: number } | null;
    averageVisitsPerMember: number;
    activeMembersWithVisits: number;
    zeroVisitActiveMembers: number;
    frequency: {
      zero: number;
      oneToTwo: number;
      threeToFive: number;
      sixToEleven: number;
      twelvePlus: number;
    };
  };
  retention: {
    eligibleExpiries: number;
    renewedMemberships: number;
    renewalRate: number;
    firstTimeMemberships: number;
    repeatRenewalMembers: number;
    preExpiryRenewals: number;
    postExpiryRenewals: number;
    averageDaysToRenewal: number | null;
    formula: string;
  };
  branches: Array<{
    id: string;
    name: string;
    active_members: number;
    visits: number;
    unique_visitors: number;
    average_visits_per_member: number;
    expiring_memberships: number;
  }>;
  segments: Array<{
    id: string;
    member_code: string;
    first_name: string;
    last_name?: string;
    last_visit?: string;
    days_inactive: number;
  }>;
}
export interface GymOsReminderRule {
  id: string;
  type: GymOsReminderType;
  channel: GymOsReminderChannel;
  offsetDays: number;
  enabled: boolean;
  sendTime: string;
  quietStart: string;
  quietEnd: string;
  lastRunAt?: string;
}
export interface GymOsReminderDelivery {
  id: string;
  memberId: string;
  type: GymOsReminderType;
  channel: GymOsReminderChannel;
  status: GymOsReminderDeliveryStatus;
  scheduledFor: string;
  sentAt?: string;
  attemptCount: number;
  lastErrorCode?: string;
  member?: { memberCode: string; firstName: string; lastName?: string };
}
export interface GymOsReminderCampaign {
  id: string;
  name: string;
  type: GymOsReminderType;
  channel: GymOsReminderChannel;
  segment:
    | "EXPIRING_IN_7_DAYS"
    | "OVERDUE"
    | "NO_VISIT_14_DAYS"
    | "NEW_MEMBER_NO_VISIT_7_DAYS";
  scheduledFor: string;
  status:
    "DRAFT" | "SCHEDULED" | "PROCESSING" | "COMPLETED" | "CANCELLED" | "FAILED";
  _count?: { deliveries: number };
  deliverySummary?: {
    scheduled: number;
    processing: number;
    sent: number;
    failed: number;
    skipped: number;
    cancelled: number;
  };
}
export interface GymOsMemberCharge {
  id: string;
  memberId: string;
  membershipId: string;
  description: string;
  amountMinor: number;
  currency: string;
  dueDate: string;
  status: GymOsMemberChargeStatus;
  effectiveStatus: GymOsMemberChargeStatus | "OVERDUE";
  totalPaidMinor: number;
  outstandingMinor: number;
  isOverdue: boolean;
  daysOverdue: number;
  member?: {
    id: string;
    memberCode: string;
    firstName: string;
    lastName?: string | null;
    phone: string;
  };
  membership?: { id: string; planNameSnapshot: string };
}
export interface GymOsMemberPayment {
  id: string;
  memberId: string;
  amountMinor: number;
  currency: string;
  method: GymOsMemberPaymentMethod;
  status: GymOsMemberPaymentStatus;
  paidAt: string;
  reference?: string | null;
  recordedByUserId: string;
  receipt?: { id: string; receiptNumber: string } | null;
  member?: {
    id: string;
    memberCode: string;
    firstName: string;
    lastName?: string | null;
  };
}
export interface GymOsMemberFinanceSummary {
  collectedTodayMinor: number;
  collectedThisMonthMinor: number;
  outstandingMinor: number;
  overdueMinor: number;
  paymentsCount: number;
  paidMemberships: number;
  partiallyPaid: number;
  unpaid: number;
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
export type RecommendationReason =
  | "NEAR_YOU"
  | "HIGHLY_RATED"
  | "MATCHES_AMENITIES"
  | "FITS_BUDGET"
  | "AVAILABLE_AT_PREFERRED_TIME"
  | "FLEX_ELIGIBLE"
  | "PREVIOUSLY_VISITED"
  | "POPULAR_WITH_CUSTOMERS";
export interface GymRecommendation {
  gym: { id: string; name: string };
  branch: {
    id: string;
    name: string;
    city: string;
    latitude: number;
    longitude: number;
  };
  distanceMeters: number | null;
  averageRating: number | null;
  reviewCount: number;
  startingPriceMinor: number;
  currency: string;
  planTypes: PlanType[];
  amenities: string[];
  flexEligible: boolean;
  availability: { availableSlots: number; openAtDesiredTime: boolean | null };
  score: number;
  reasons: RecommendationReason[];
}
export interface RecommendationResponse extends PaginatedResponse<GymRecommendation> {
  context: {
    personalized: boolean;
    locationUsed: boolean;
    city: string | null;
    radiusKm: number;
  };
}
export interface CustomerGymPreference {
  id?: string;
  userId?: string;
  preferredAmenities: string[];
  preferredPlanType: PlanType | null;
  preferredWorkoutHour: number | null;
  preferredRadiusKm: number;
  preferredBudgetMinMinor: number | null;
  preferredBudgetMaxMinor: number | null;
  version?: number;
}
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
  source?: "STANDARD_PLAN" | "FLEX";
  customerChargeMinor?: number | null;
  reimbursementMinor?: number | null;
  flexSubscriptionId?: string | null;
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
  review?: Pick<
    MyReview,
    "id" | "rating" | "title" | "comment" | "status" | "createdAt" | "editedAt"
  > | null;
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

export type ReviewStatus = "PUBLISHED" | "HIDDEN" | "REMOVED";
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
export interface MyReview extends Omit<GymReview, "reviewerName"> {
  bookingId: string;
  customerId: string;
  status: ReviewStatus;
}
export interface GymReviewPage extends PaginatedResponse<GymReview> {
  aggregate: { averageRating: number | null; reviewCount: number };
}

export type NotificationRoute =
  | { screen: "Booking" | "CheckIn" | "BookingReview"; bookingId: string }
  | { screen: "Gym" | "PartnerReviews"; gymId: string }
  | { screen: "Flex" }
  | { screen: "PartnerSettlement"; settlementId: string }
  | { screen: "PartnerGymOs"; gymId: string };
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
  category:
    | "BOOKING"
    | "PAYMENT"
    | "CHECK_IN"
    | "REFUND"
    | "REVIEW"
    | "SETTLEMENT"
    | "MARKETING"
    | "FLEX";
  inAppEnabled: boolean;
  pushEnabled: boolean;
}

export interface ServiceCity {
  id: string;
  code: string;
  name: string;
  state: string;
  country: string;
  active: boolean;
}
export interface FlexPlan {
  id: string;
  name: string;
  code: string;
  description?: string | null;
  priceMinor: number;
  currency: string;
  durationDays: number;
  totalUsageLimit: number;
  primaryCityLimit: number;
  secondaryCityLimit: number;
  dailyUsageLimit: number;
  bookingAdvanceDays: number;
  status: string;
}
export interface FlexCheckout {
  subscriptionId: string;
  paymentId: string;
  provider: string;
  orderId: string;
  amount: number;
  currency: string;
  status: string;
  simulated: boolean;
  keyId?: string;
}
export interface FlexSubscription {
  id: string;
  status: string;
  planName: string;
  priceMinor: number;
  currency: string;
  totalUsageLimit: number;
  primaryCityLimit: number;
  secondaryCityLimit: number;
  startedAt?: string | null;
  expiresAt?: string | null;
  primaryCity: ServiceCity;
  secondaryCity?: ServiceCity | null;
  payment?: { id: string; status: string } | null;
  periods: Array<{
    id: string;
    totalLimit: number;
    primaryCityLimit: number;
    secondaryCityLimit: number;
    startsAt: string;
    endsAt: string;
  }>;
}
export interface FlexEligibleGym {
  id: string;
  gym: { id: string; name: string };
  branch: {
    id: string;
    name: string;
    address: string;
    city: string;
    timezone: string;
  };
  serviceCity: ServiceCity;
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

export type GymMemberStatus = "ACTIVE" | "INACTIVE" | "ARCHIVED";
export interface GymOsMember {
  id: string;
  memberCode: string;
  firstName: string;
  lastName?: string | null;
  phone: string;
  email?: string | null;
  status: GymMemberStatus;
  joinedAt?: string | null;
  createdAt: string;
  updatedAt?: string;
  notes?: string | null;
  primaryBranch?: { id: string; name: string } | null;
  gym?: { id: string; name: string };
}
export interface GymOsMemberSummary {
  total: number;
  active: number;
  inactive: number;
  archived: number;
  memberLimit: number;
  remainingCapacity: number;
  overLimit: boolean;
}
export interface GymOsMemberImportReport {
  totalRows: number;
  validRows: number;
  importedRows: number;
  skippedRows: number;
  failedRows: number;
  errors: Array<{
    rowNumber: number;
    field: string;
    code: string;
    message: string;
  }>;
}
