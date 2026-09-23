# GYMRide — Codebase Understanding (Deep Audit)

Audit date: 2026-09-23. Method: direct source inspection (backend NestJS modules, Prisma schema, both Next.js panels, the Expo mobile app, shared packages) plus running the test suites. Documentation under `docs/` was used only as a cross-check; every claim below is sourced from code, and every place code and docs disagreed is called out explicitly with code treated as ground truth. This file is descriptive only — no application code was modified to produce it.

---

## 1. Executive summary

GYMRide is a gym-access marketplace implemented as a single NestJS 11 modular monolith (`backend/`) backed by PostgreSQL+PostGIS and Redis/BullMQ, served to three clients: an Admin Next.js portal, a Partner Next.js portal, and an Expo/React Native customer app. Phases 1–8 are implemented: foundation, auth/gyms, portals, plans/slots/bookings, finance, mobile app, check-in, reviews/notifications. The most recent commit (`573a44c`, "phase 8 completed") finished the reviews/notifications work that was mid-flight at the start of this audit (a new `REFUND_FAILED` notification type, its backfill migration, Swagger response schemas, and expanded runtime tests) — the working tree is now clean and that commit is the current `HEAD`.

Overall the implementation is unusually disciplined for its stated scope: money fields are integers, the ledger is enforced append-only at the Postgres trigger level (not just by service convention), state transitions use conditional `updateMany`/`SELECT ... FOR UPDATE` rather than optimistic client-side assumptions, and idempotency keys are used consistently across bookings, payments, refunds, settlements, and webhooks. The gaps found are narrow and specific (listed in §26–27), not systemic.

**A confirmed prompt-injection payload was found** in `frontend/admin-panel/AGENTS.md` and `frontend/partner-panel/AGENTS.md` (identical text, also pulled into each panel's `CLAUDE.md` via `@AGENTS.md`) — see §29.

---

## 2. Architecture

```
React Native customer app (Expo 57) ──┐
Next.js Admin Portal (3001)  ─────────┼─ HTTPS ─> NestJS API (3000) ─┬─> PostgreSQL 17 + PostGIS (source of truth)
Next.js Partner Portal (3002)  ───────┘                              ├─> Redis (OTP, locks, BullMQ)
                                                                      └─> Razorpay / dev payment+push providers
```

Dependency map (as actually wired, not aspirational):

```
mobile-app/src/api/*  ──(own fetch client, NOT @gymride/api-client)──> backend REST
frontend/admin-panel, frontend/partner-panel
    └─ lib/api.ts → @gymride/web-ui (createWebApi) → @gymride/api-client (ApiClient)
                     → @gymride/types (shared response shapes)
                     → @gymride/validation (zod, duplicated vs. backend class-validator — see §20)
backend/src/*  → Prisma (PrismaService) → PostgreSQL/PostGIS
backend/src/*  → Redis (OTP, booking/finance advisory locks, BullMQ queues)
backend/src/finance/* → Razorpay provider or DevelopmentPaymentProvider
backend/src/notifications/* → Expo push provider or development provider
```

Important correction to the idealized dependency diagram commonly assumed for this stack: **the mobile app does not use `@gymride/api-client`** — `mobile-app/package.json` has no dependency on it. Mobile has its own independent HTTP client (`mobile-app/src/api/client.ts`) and only shares `@gymride/types`. `@gymride/api-client` itself only wraps 4 of ~15 backend domains (plans, slots, bookings, checkIns) — most frontend API calls (gyms, branches, finance, reviews, notifications, admin) are hand-written per-app against a raw `request()` method, not centralized.

RolesGuard is applied per-controller, not globally; a single Postgres advisory lock (`finance-lock.ts`, constant `517005`) serializes all financial writes platform-wide; a booking-slot row lock (`SELECT ... FOR UPDATE`) serializes capacity checks per slot.

---

## 3. Workspace structure

| Path | Responsibility | Notes |
|---|---|---|
| `backend/` | NestJS 11 API, Prisma schema/migrations, Jest specs | Node 22 required (pnpm 11.19 refuses <22.13) |
| `frontend/admin-panel/` | Next.js 16 App Router, platform ops/moderation | No `features/` dir; logic in `app/(protected)/**` + `lib/*.ts` |
| `frontend/partner-panel/` | Next.js 16 App Router, gym/branch/plan/booking/finance/check-in/review/notification management | Same shape as admin-panel |
| `mobile-app/` | Expo 57 / React Native 0.86 customer app | Own API layer, React Context (no Redux/Zustand) + TanStack Query |
| `packages/api-client` | Thin fetch wrapper + 4-domain typed client | Only ~30% of backend surface covered |
| `packages/types` | Shared TS types for API payloads | Widely consumed; one drift found (§20) |
| `packages/validation` | Shared zod schemas | Duplicated (not shared) with backend DTOs; several bound mismatches (§20) |
| `packages/web-ui` | Shared login/layout/finance-workspace React components | Consumed by both panels |
| `packages/eslint-config`, `packages/tsconfig` | **Placeholders only** — no `package.json`, just a README saying "reserved for later" | Not implemented, not consumed |
| `docs/` | Architecture/API/testing docs | Accurate in every case checked in this audit except two (§13, §7) |
| `infrastructure/` | Docker/CI-CD/Azure READMEs retained from earlier phases | Not required to run the app locally |

Root `package.json` scripts: `dev` (parallel backend+admin+partner), `dev:backend/admin/partner`, `build`, `lint`, `test`, `typecheck`, `db:migrate`, `db:seed`. `pnpm-workspace.yaml` lists 9 workspace projects.

---

## 4. Database / domain model

`backend/prisma/schema.prisma` — 897 lines, 24 enums, 37 models. Read in full (not just names).

**Migration history (chronological, 11 migrations)**: `initial_foundation` → `auth_and_gym_management` → `plans_slots_bookings` → `finance` → `settlement_reversal` → `refund_policy_fingerprint` → `secure_check_in` → `reviews_notifications` → `push_session_binding` → `notification_projection_baseline` → `refund_failed_notification` (most recent, adds `REFUND_FAILED` enum value + backfills `notification_projections` for pre-existing FAILED refunds so deployment doesn't spam stale alerts).

**Core identity/RBAC**: `User` (phone/email unique, `UserStatus: ACTIVE|INACTIVE|BLOCKED|PENDING`) — `Role`/`UserRole` join for platform roles (`RoleName: CUSTOMER|GYM_OWNER|GYM_MANAGER|GYM_STAFF|ADMIN|SUPER_ADMIN`) — `GymMembership` (separate from `UserRole`) scopes a user to a specific gym and optionally a specific branch with `GymMembershipRole: OWNER|MANAGER|STAFF`, unique on `[userId, gymId, branchId, role]` so one user can hold multiple distinct scoped roles. `RefreshSession` stores only a SHA-256 hash of the refresh token, indexed on `[userId, revokedAt]` and `[expiresAt]`.

**Gym/Branch**: `Gym` (`GymStatus: DRAFT|PENDING_APPROVAL|APPROVED|REJECTED|SUSPENDED`) owned via `ownerId` (`onDelete: Restrict`). `GymBranch` (`BranchStatus: DRAFT|ACTIVE|INACTIVE|SUSPENDED`) holds `latitude/longitude` (`Decimal(9,6)`) plus an `Unsupported("geography(Point,4326)")` `location` column that Prisma cannot write directly — a DB trigger (`gym_branches_location_sync`, from the initial migration) syncs it from lat/long on insert/update. `Amenity`/`BranchAmenity` (full-replace association pattern, no incremental add/remove). `OperatingHours` is one row per `(branchId, weekday, period)` supporting split shifts.

**Plans/Slots**: `GymPlan` (`PlanType: DAY_PASS|MONTHLY|QUARTERLY|YEARLY`, `PlanStatus: DRAFT|ACTIVE|INACTIVE|ARCHIVED` — **`ARCHIVED` is defined but unreachable**, no service code ever sets it) — `PlanBranch` join. `BranchSlotConfig` (one per branch: duration/capacity/booking-window/min-advance). `SlotInstance` (`SlotStatus: AVAILABLE|BLOCKED|CLOSED`, unique on `[branchId, startAt, endAt]`). `BranchAvailabilityException` (holiday/maintenance/private-event/temporary-closure, unique per `[branchId, date]`).

**Booking**: `Booking` (`BookingStatus: CREATED|PAYMENT_PENDING|CONFIRMED|CHECK_IN_AVAILABLE|CHECKED_IN|COMPLETED|CANCELLED|EXPIRED|NO_SHOW|PAYMENT_FAILED|REFUNDED`), snapshots `planName/planType/priceMinor/currency` at creation time (plan edits never retroactively alter historical bookings), unique on `[userId, idempotencyKey]`, indexed for slot-capacity queries (`[slotId, status]`) and reservation-expiry sweeps (`[reservationExpiresAt, status]`). `BookingEvent` is an append-only audit trail of every transition (`BookingEventType` has 11 values covering creation, expiry, cancellation, QR/OTP issuance/verification, completion, no-show).

**Finance** (all monetary fields are `Int`, i.e. minor units/paise — confirmed no `Decimal`/`Float` anywhere in the money path): `Payment` (`PaymentStatus`, 10 values, tracks `refundedAmount`/`requiresReview`) — `PaymentAttempt` (unique `operationKey`, records provider-call outcomes even when uncertain) — `PaymentWebhookEvent` (unique `[provider, providerEventId]`, plus a `payloadHash` to detect a same-ID-different-payload replay) — `Refund` (unique `idempotencyKey` and `providerRefundId`) — `GymEarning` (gross/tax/discount/commission/refund/net, `commissionBps`+`commissionVersion` snapshotted) — `FinancialLedgerEntry` (unique `[sourceId, category, account]`, `LedgerCategory` has 8 values including `SETTLEMENT_REVERSAL`) — `Settlement`/`SettlementItem`/`SettlementReversal`. **The ledger and settlement tables are enforced append-only at the database level**: `finance_immutable_ledger()` triggers block `UPDATE`/`DELETE`/`TRUNCATE` on `financial_ledger_entries`, `settlement_items`, and `settlement_reversals` (confirmed in `20260914000000_finance/migration.sql` and `20260914010000_settlement_reversal/migration.sql`), and separate `finance_snapshot_guard()`/`payment_snapshot_guard()` triggers protect capture/snapshot fields on `gym_earnings`/`payments` from later mutation. This is stronger than most docs describe — it's not just "the service layer never calls update," it's physically blocked by Postgres.

**Check-in**: `CheckIn` (`CheckInStatus: AVAILABLE|VERIFIED|COMPLETED|EXPIRED`, `CheckInMethod: QR|OTP`) — `CheckInToken` (unique `tokenHash`, only a hash ever persisted) — `CheckInOtpChallenge` (hashed code, bounded `attempts`/`maxAttempts`).

**Reviews**: `Review` (`ReviewStatus: PUBLISHED|HIDDEN|REMOVED`), unique on `bookingId` (one review per booking), moderation fields (`moderatedAt/moderatedById/moderationReason`).

**Notifications**: `Notification` (unique `dedupeKey`) — `PushDevice` (unique `[provider, token]`, optional `sessionId` binding) — `NotificationPreference` (PK `[userId, category]`) — `PushDelivery` (unique `[notificationId, deviceId]`, `PushDeliveryStatus: PENDING|PROCESSING|SENT|FAILED|SKIPPED`) — `NotificationProjectionCursor` + `NotificationProjection` (event-sourcing cursor/dedup tables that make the projection sweep replay-safe).

**Audit**: `AuditLog` (`AuditAction`, 12 values) — every gym-lifecycle transition, refund request, settlement lifecycle step, and review moderation writes one of these rows, always inside the same transaction as the mutation it records.

---

## 5. Backend modules audited

`backend/src/{auth, users, admin, gyms, branches, amenities, operating-hours, plans, slots, bookings, finance, check-ins, gym-access, reviews, notifications, common, config, database, redis, health}`. Every module's controller → DTO → guard → service → Prisma → (event/queue) → response path was traced (details in §6–§16). `gym-access/gym-access.service.ts` is the single centralized authorization module — every other domain module calls into it rather than re-implementing ownership checks; no controller anywhere in the backend accepts a client-supplied owner/gym/branch ID as proof of authorization.

---

## 6. Authentication

**Phone OTP** (`auth/otp.service.ts`): OTP is `crypto.randomInt(0, 1_000_000)` (CSPRNG). Redis keys are HMAC-SHA256(`OTP_HASH_SECRET`, `phone|ip`) — no raw phone/IP appears as key text. Challenge stored as `{hash: HMAC(phone:otp), attempts: 0}`, TTL 300s default; raw OTP is **never persisted**. Resend cooldown 45s; rate limit 5/hour per phone, 25/hour per IP. Verification runs an atomic Redis Lua script — no TOCTOU window on concurrent verify attempts. Delivery is provider-abstracted; only a `DevelopmentOtpProvider` exists, which echoes the OTP in the response **only when `NODE_ENV=development`**, else fails closed (no real SMS provider wired up — a known, documented limitation).

**JWT access tokens**: claims `{sub, roles, sessionId, tokenType}`, signed with `JWT_ACCESS_SECRET`, 15-min default TTL. No fallback/default secret exists anywhere — `environment.ts` enforces a 32-char minimum on all four security secrets at boot and throws if unset.

**Refresh tokens**: only a SHA-256 hash is persisted (`RefreshSession.tokenHash`). Rotation-on-refresh with genuine **reuse detection**: presenting a stale (already-rotated) refresh token immediately revokes the whole session (`SESSION_REVOKED`) rather than silently failing — verified as real, working code, not just documented intent. The rotation update itself is a conditional `updateMany` guarded by the current token hash, closing the race where two concurrent refresh calls with the same token could both succeed.

**Logout**: `logout()` revokes one session + disables its push devices; `logoutAll()` revokes every session for the user. Both transactional.

**RBAC/IDOR**: `RolesGuard` (per-controller, not global) checks `@Roles()` metadata against the JWT's `roles` claim. Fine-grained ownership is centralized in `gym-access.service.ts`: `assertGymOwnerOrAdmin` (404, not 403, on mismatch — deliberately indistinguishable from "not found," per `docs/architecture/resource-authorization.md`), `assertGymManagement` (owner/admin or org-wide MANAGER membership), `assertBranchManagement` (adds branch-scoped MANAGER), `assertBranchCheckIn` (adds STAFF, for check-in verification only).

**Verified risk**: `JwtStrategy.validate()` and `AuthService.refresh()` never re-check `User.status` — a `BLOCKED` user's still-valid JWT keeps working until it expires. Currently low-severity because no endpoint anywhere in the codebase actually sets a user to `BLOCKED` (grepped `users/`, `admin/` — none found), but the gap is real and will matter the moment a ban feature ships.

**Throttling**: global `ThrottlerGuard` (100 req/60s default) applies platform-wide including auth routes; OTP has its own stricter Redis-based layer on top.

---

## 7. Gym & branch management

State machine (`gyms/gym-state.ts`): `DRAFT/REJECTED → PENDING_APPROVAL → APPROVED ⇄ SUSPENDED`. Submission requires ≥1 branch **and** operating hours on every branch (not just one). Owner-editable only in `DRAFT`/`REJECTED` (admins bypass). Approval/rejection/suspension is admin-only (`AdminGymsController`, class-level `@Roles(ADMIN, SUPER_ADMIN)` — `GYM_OWNER` cannot self-approve), transitions are race-safe (conditional `updateMany` + count check), audited, and reject/suspend require a ≥10-char reason.

PostGIS: app code never writes the `location` geography column directly (Prisma can't express `Unsupported(...)` writes) — a DB trigger derives it from `latitude`/`longitude` on every insert/update. Nearby search (`gyms/public-gyms.service.ts`) is a parameterized raw SQL query using `ST_DWithin`/`ST_Distance` against `ST_SetSRID(ST_MakePoint(lng,lat),4326)::geography`, joined with live amenity/review aggregates, ordered by distance with an `id` tiebreak for stable pagination — no SQL-injection risk (all dynamic values go through `Prisma.sql`/`Prisma.join`).

Amenities and operating hours are both full-replace patterns (delete-all + recreate in one transaction) rather than incremental diffs. Branch suspension is admin-exclusive even though owners/managers can otherwise edit a branch (`branches.service.ts` explicitly checks `isAdmin`). Public discovery hard-filters to `APPROVED` gyms with `ACTIVE` branches — no draft/suspended data leaks through.

---

## 8. Plans & slots

Plan `durationDays` is computed server-side from `PlanType` (`DAY_PASS=1, MONTHLY=30, QUARTERLY=90, YEARLY=365` — fixed terms, not calendar months). Plan activation requires ≥1 assigned branch. Gym-level plan management requires an **org-wide** (`branchId: null`) MANAGER membership — a branch-scoped manager can configure slots/availability for their branch but cannot manage plans for the gym.

`SlotInstance` materialization is **lazy and on-read**, not cron/BullMQ-driven — the single entry point is `SlotsService.ensureHorizon(branchId)`, called from availability queries, slot-config changes, and un-closing an exception, never from booking creation itself. This means a slot must already have been materialized by a prior availability read before a booking against it can succeed — booking creation does not self-heal missing slots. Duplicate-prevention relies on a DB unique constraint (`[branchId, startAt, endAt]`) + `skipDuplicates: true`, not an explicit lock — safe for correctness, not optimized against redundant concurrent computation. Config-change slot regeneration (delete unbooked future slots, then regenerate) is **not wrapped in a single transaction** across its two steps — a narrow, low-severity crash window exists.

---

## 9. Booking engine

Full state diagram (built from `bookings/booking-state.ts` plus every service that actually writes each transition):

```
CREATED --> PAYMENT_PENDING                (bookings.service.ts: createTransaction)
PAYMENT_PENDING --> CONFIRMED              (payments.service.ts: finalize, on capture within reservation window)
PAYMENT_PENDING --> EXPIRED                (reservation-expiration.service.ts, BullMQ delayed job)
PAYMENT_PENDING --> PAYMENT_FAILED         (payments.service.ts, provider FAILED)
PAYMENT_PENDING --> CANCELLED              (bookings.service.ts: cancel — the ONLY status this method allows)
CONFIRMED --> CHECK_IN_AVAILABLE           (check-in.service.ts, BullMQ 'open' job at window.opensAt)
CHECK_IN_AVAILABLE --> CHECKED_IN          (check-in.service.ts, QR/OTP verify)
CHECK_IN_AVAILABLE --> NO_SHOW             (check-in.service.ts, BullMQ 'no-show' job)
CHECKED_IN --> COMPLETED                   (check-in.service.ts, BullMQ 'complete' job)
{PAYMENT_PENDING, CONFIRMED, CANCELLED, EXPIRED, PAYMENT_FAILED} --> REFUNDED   (refunds.service.ts, full refund)
Terminal (no outgoing transition in code): COMPLETED, NO_SHOW, REFUNDED
```

**Gap, confirmed intentional**: `CONFIRMED → CANCELLED` is *permitted* by the transition table but **no service method executes it** — a customer cannot cancel an already-confirmed (paid) booking through any current endpoint. This matches the doc's explicit Phase-4 scoping, but the transition table is a broader contract than what's enforced, so a careless future addition using only the transition table as its guard (rather than re-deriving refund-eligibility rules) could bypass finance invariants.

**Creation path**: idempotency-key pre-check (SHA-256 request fingerprint over `{branchId,planId,slotId}`) → best-effort Redis lock (fails open, logs a warning) → DB transaction: `SELECT ... FOR UPDATE` on the target slot row → plan/gym/branch/window validation → duplicate-booking check → **capacity check as a live `COUNT`** (no decremented counter column) over bookings in `{CONFIRMED, CHECK_IN_AVAILABLE, CHECKED_IN}` or still-unexpired `PAYMENT_PENDING` → insert `Booking`+`BookingEvent` atomically. A `P2002` on the idempotency unique index is caught and resolved as a race-safety net. Non-day-pass plans reject a supplied `slotId` outright (memberships have no slot/capacity concept in Phase 4).

**Cancellation**: customer-only, own booking, `PAYMENT_PENDING`-only, atomic conditional `updateMany`. No slot-capacity side effect needed — capacity counting already excludes `CANCELLED`. No partner/admin cancellation endpoint exists (read-only for those roles).

**Expiry/no-show — two BullMQ queues** (`booking-expiration`, `booking-check-in-lifecycle`), both defensively re-validate status+deadline inside a transaction before mutating (safe against replay), both gated by env flags (`BOOKING_QUEUE_ENABLED`, `CHECK_IN_QUEUE_ENABLED`) that default `true` in production / `false` otherwise. **Discrepancy vs. docs**: both queue services call `config.getOrThrow('REDIS_HOST'/'REDIS_PORT')` unconditionally in their constructors, so Redis config is a hard startup dependency even when the corresponding queue is disabled — contradicting the doc's claim that local environments can disable a queue when Redis is unavailable. `CheckInLifecycleService.reconcileSchedules()` (boot-time recovery sweep) caps at 1000 `CONFIRMED` bookings with no pagination — a large backlog after a Redis outage could leave some bookings' schedules unrecovered beyond that cap (mitigated by a 60s catch-all sweep).

---

## 10. Payments

Provider selection via `PAYMENT_PROVIDER` (`development`|`razorpay`); `razorpay` requires 3 secrets via `getOrThrow`. Payout provider is hard-blocked outside `development`/`test` — **there is genuinely no live payout path**, by design.

Order creation takes a global finance advisory lock + booking row lock, reuses an existing `Payment` row if present (booking-scoped idempotency), calls the provider *outside* the DB transaction, and treats provider-call failure as "uncertain outcome" (`PaymentAttempt.status = UNKNOWN`) rather than assuming failure. Signature verification: HMAC-SHA256 + `timingSafeEqual`, rejects non-hex-64 signatures before comparing; checkout verification additionally does an independent authenticated provider lookup, not just signature trust.

Webhook idempotency is a genuine processed-event table, not just a unique index: `PaymentWebhookEvent` unique on `[provider, providerEventId]`, `upsert`-based with `P2002` fallback-to-read (handles a Prisma upsert-race quirk), **plus** a `payloadHash` comparison that raises `FINANCIAL_INTEGRITY_ERROR` if the same event ID ever arrives with a different payload (a protection stronger than the architecture doc describes).

---

## 11. Refunds

Idempotency-keyed (`Refund.idempotencyKey`), replay of an identical request returns the original record, a differing field on the same key is a conflict error. Refund ceiling sums all in-flight (`CREATED/PENDING/PROCESSING/SUCCESS`) refunds against the payment before allowing a new one. Provider dispatch is outside the DB transaction; failure leaves the refund `PROCESSING` with `reconciliationRequired: true` — never auto-retried (a bare `catch{}` here also swallows the underlying error without logging it, a minor observability gap). Full vs. partial is determined purely by `total === payment.amount`; a full refund also transitions the booking to `REFUNDED` (if the transition table allows it from that state) and writes ledger entries that mirror the original capture with the opposite sign, including a proportional commission reversal on `GymEarning`. **Refunding an already-settled earning is blocked upfront** — the only path to touch a settled earning is the explicit admin settlement-reversal flow, so a refund can never silently corrupt a paid settlement.

---

## 12. Finance & settlements

Commission: `proportional(amount, bps, 10000)` using BigInt half-up integer rounding — no floats in the money path. Default 1500 bps (15%), configurable. Ledger entries recorded per event: capture writes 3 rows (customer payment, platform commission, gym earning); refund writes 3 signed-negative mirror rows; settlement payout writes 1 row; settlement reversal writes 1 compensating row. All enforced append-only at the Postgres trigger level (§4).

Settlement generation is idempotency-keyed, selects up to 1000 unsettled/unallocated earnings under the shared advisory lock (prevents double-allocation across concurrent generation calls). Processing is a 3-phase state machine (`PROCESSING` → provider call outside the tx → `settled:true`+ledger+`PAID`). Reversal is admin-only, idempotency-keyed, only legal from `PAID`, cross-checks the original ledger amount before writing a compensating entry, and deliberately does **not** delete/alter the original `SettlementItem` rows (an immutable payout-hold design).

**Known, documented tradeoff, not a bug**: a single global advisory lock (`pg_advisory_xact_lock(517005)`) serializes *all* financial writes platform-wide — a real throughput bottleneck under load, but the architecture doc itself flags this as intentionally conservative pending measured load review.

---

## 13. Check-in

QR: 256-bit token (`randomBytes(32)`), only an HMAC-SHA256 hash persisted, 180s default TTL, single-use via atomic conditional claim (`updateMany` with `consumedAt:null` guard, count-checked — not check-then-set), reissue atomically revokes all prior unconsumed tokens for that check-in. OTP: 6-digit code, HMAC-hashed, plaintext never stored (explicitly commented in code), rate-limited (5/hour, 30s cooldown), bounded attempts (default 5) consuming the challenge on exhaustion.

Verification (`CheckInVerificationService`) resolves the credential's branch **before** trusting client input, then calls `assertBranchCheckIn` — a staff member scoped to Branch A cannot verify Branch B credentials.

Actual lifecycle (from schema + `check-in.service.ts`, not assumed): `CheckIn.status: AVAILABLE → VERIFIED → COMPLETED`, with `EXPIRED` for no-shows; `Booking.status: CONFIRMED → CHECK_IN_AVAILABLE → CHECKED_IN → COMPLETED`, with `CHECK_IN_AVAILABLE → NO_SHOW` as the timeout branch. Driven by the same `booking-check-in-lifecycle` BullMQ queue described in §9 (three deterministic delayed jobs per booking + a 60s repeat sweep as a catch-all), with request-time sync as a fallback when the queue is disabled. No discrepancies found vs. `docs/architecture/phase-7-check-in.md` — every claim in that doc checked out against code.

---

## 14. Reviews

Read directly (`backend/src/reviews/reviews.service.ts`): creation (`create()`) takes a booking row lock, requires the booking be the caller's own and `COMPLETED`, creates the review, then fans out a `REVIEW_RECEIVED` notification intent to the gym owner plus every active org-wide `MANAGER` membership, all in one transaction; a `P2002` (the `bookingId` unique constraint — one review per booking) is caught and turned into `REVIEW_ALREADY_EXISTS`. Editing (`edit()`) takes a review row lock, blocks edits once `REMOVED`, allows edits at any other status (including `HIDDEN`) without resetting moderation state. Public listing (`publicList()`) filters to `PUBLISHED` + `APPROVED` gym + (if given) `ACTIVE` branch, computes the aggregate rating via a real `_avg`/`_count` SQL aggregate scoped identically to the list query (not a stored/cached counter — always live). Partner listing scopes to gyms the caller owns or org-wide-manages (or a specific `gymId` the caller is verified to manage). Moderation (`moderate()`) takes a row lock, requires ≥3-char reason, no-ops if the status is unchanged, otherwise updates and writes an `AuditLog` row in the same transaction.

The commit that completed Phase 8 (`573a44c`) hardened this domain's runtime test (`backend/test/reviews-notifications.runtime-spec.ts`) to also verify: moderate→hide→restore→edit→re-remove sequences keep the aggregate correct at each step, and 3 `AuditLog` rows accumulate for 3 moderation actions on one review (previously the test only checked 1).

---

## 15. Notifications

Read directly (`notification-projection.service.ts`, `notification-intent.ts`, `notification-delivery.service.ts`). Architecture is genuinely event-sourced:

```
Domain state (booking_events / payments / refunds / settlements tables)
  → NotificationProjectionService sweeps (cursor-based for booking events, dedup-table-based for the other 3 sources)
  → createNotificationIntent() — shared helper: checks NotificationPreference, inserts Notification with a unique dedupeKey (createMany + skipDuplicates, so concurrent duplicate intents collapse to one row), fans out PushDelivery rows to every enabled device (also skipDuplicates)
  → NotificationDeliveryService.deliverDue() — claims PENDING/stale-PROCESSING rows via a conditional updateMany, calls the push provider, records SENT/FAILED/SKIPPED with exponential backoff (capped 60min) and permanent-failure device invalidation
```

Cursor mechanics: `projectBookingEvents()` locks the cursor row (`FOR UPDATE`), reads events since the cursor with `NOT EXISTS` against `notification_projections` (skip-locked, batch 100), writes notification intents + a projection-dedup row per event, all in one transaction — crash-safe replay by construction (cursor and writes commit together). The three non-cursor sources (payment status, refund status/failure, paid settlements) use the same dedup-table pattern without a cursor, scanning for un-projected rows directly. The `REFUND_FAILED` addition (this session's "mid-flight" work, now committed) follows this exact pattern.

Preferences: transactional categories (everything except `MARKETING`) cannot have `inAppEnabled` disabled — enforced in `NotificationsService.updatePreference` — matching the doc's "transactional in-app notices cannot be disabled" claim exactly. `MARKETING` in-app notices are opt-in (default `inAppEnabled: false`); push defaults to enabled for every other category.

Device registration: upsert on `[provider, token]` for a fresh registration, or a caller-verified-owned update for rotation; a token collision with another user's device is a 409, not a silent takeover.

---

## 16. Background jobs / BullMQ

No `@Cron`/`@Interval` decorators exist anywhere in the backend — all periodic behavior is BullMQ `repeat` jobs.

| Queue | Producer | Consumer | Retry | Idempotency | Env flag (default) |
|---|---|---|---|---|---|
| `booking-expiration` | booking creation (`schedule()`) | `expire()` | 5 attempts, exponential | conditional `updateMany` on status+deadline | `BOOKING_QUEUE_ENABLED` (prod: true) |
| `booking-check-in-lifecycle` | payment finalize + boot-time reconcile (capped 1000) | `syncBooking`/`syncScope` + 60s sweep | 5 attempts, exponential | deterministic `jobId`s + row-locked conditional transitions | `CHECK_IN_QUEUE_ENABLED` (prod: true) |
| `notification-delivery` (sweep only) | module init, 30s repeat | `projection.catchUp()` then `delivery.deliverDue()` | 5 attempts, exponential | claim-based (`updateMany` before processing) — verified directly in §15 | `NOTIFICATION_QUEUE_ENABLED` (prod: true) |

All three queues open independent Redis connections (`REDIS_HOST/PORT/PASSWORD` via `getOrThrow`) rather than sharing a pool — a minor resource-efficiency note, not a correctness issue. As noted in §9, the booking/check-in queue constructors require Redis config even when their own feature flag is off.

---

## 17. Admin panel

Both panels are thin wrappers around `@gymride/api-client`/`@gymride/web-ui`/`@gymride/validation`/`@gymride/types` — no `features/` directory; logic lives in `app/(protected)/**/page.tsx` plus small `lib/*.ts` modules, each with a colocated test.

**Auth (shared mechanism, both panels)**: OTP login via the shared `LoginScreen` (`packages/web-ui`). Access token kept in memory only; refresh token in `sessionStorage` (tab-scoped, namespaced `admin`/`partner`). One automatic refresh+retry on 401; failure clears session and redirects to `/login`. **Route protection is entirely client-side** (`AuthGate` reading React state + `window.location.assign`) — there is no `middleware.ts` anywhere in the repo. This means the frontend gate is UX-only; real enforcement depends entirely on the backend rejecting unauthorized calls.

Routes: `/`, `/login`, `/dashboard`, `/gyms`, `/gyms/pending`, `/gyms/[gymId]`, `/bookings`, `/bookings/[bookingId]`, `/finance`, `/reviews`, `/profile`.

| Feature | Status | Evidence |
|---|---|---|
| Gym approvals (approve/reject/suspend/reactivate) | COMPLETE | `app/(protected)/gyms/[gymId]/page.tsx` |
| Gym directory / pending queue | COMPLETE | `components/gym-list.tsx` |
| Dashboard summary | COMPLETE | `app/(protected)/dashboard/page.tsx` |
| Bookings (platform-wide, read-only by design) | COMPLETE | `app/(protected)/bookings/**` |
| Finance (summary/payments/refunds/earnings/settlements/ledger/reconciliation) | COMPLETE | `packages/web-ui/src/finance.tsx` role="admin" |
| Review moderation | COMPLETE | `app/(protected)/reviews/page.tsx` + `lib/review-filters.ts` |
| User management (list/ban/role-change) | **MISSING — both UI and backend**; not just a frontend gap | Backend `users.controller.ts` only exposes `GET/PATCH /users/me` |
| Notifications | **MISSING** — no route/nav entry at all, despite the backend domain being generic | — |
| Profile | COMPLETE | `app/(protected)/profile/page.tsx` |

Client-side business-rule tests worth knowing: `gym-actions.test.ts` enforces the gym-status action matrix so the UI never offers an invalid transition; `check-in-visibility.test.ts` strips QR/OTP secrets from the admin audit view.

---

## 18. Partner panel

Routes (21 total) cover gyms (CRUD+submit), branches (CRUD+amenities+operating-hours+slot-settings), plans, bookings (read-only), check-ins (verify), finance (view-only), reviews (read-only), notifications (list/read), profile. Nav is role-filtered (`GYM_STAFF` sees only Check-ins+Profile in the menu) but **this is nav-only, not route-only** — nothing stops a `GYM_STAFF` user from typing `/finance` into the address bar; that page renders and depends entirely on the backend rejecting the resulting API calls.

| Feature | Status | Evidence |
|---|---|---|
| Gym CRUD + submission | COMPLETE | `components/gym-form.tsx`, surfaces backend `missing[]` requirement codes |
| Branches / amenities / operating hours / slot settings | COMPLETE | Dedicated pages per sub-resource |
| Plans | COMPLETE | `components/plan-form.tsx`, rupee↔paise conversion |
| Bookings | COMPLETE, read-only | — |
| Check-in verification | COMPLETE | QR + OTP forms, `lib/check-in.ts` maps ~11 backend error codes to UI states |
| Finance/earnings/settlements | **PARTIAL by design** — view-only; refund-request/settlement-generate/reverse forms are admin-role-gated inside the same shared component | `packages/web-ui/src/finance.tsx` |
| Reviews | COMPLETE, read-only | — |
| Notifications (list/read) | COMPLETE for list/read; **no UI for preferences or device management** | Backend also exposes `GET/PATCH /notifications/preferences` and `POST/DELETE /notifications/devices` with no web surface |
| Profile | COMPLETE | — |

Cross-panel authorization is **fully backend-trust**: the frontend never filters "is this my gym" client-side — it renders whatever the backend returns for the current JWT. `lib/notification-route.ts` is a genuine defensive control worth noting: it's tested to **never open a provider-supplied URL**, only a fixed whitelist of screen names with UUID-shape validation — an actual anti-open-redirect guard on push/notification payload data.

**Backend features with no UI in either panel**: refund reconciliation (`POST /admin/finance/refunds/:id/reconcile` exists, zero UI references it anywhere); notification preferences/device management (no web surface in either panel).

---

## 19. Mobile application

Navigation: bottom tabs (`Home, Explore, Bookings, Profile`) nested under a root stack (`Gym, Plan, Slots, Review, Payment, Booking, CheckIn, BookingReview, GymReviews, Notifications`) — no separate auth stack; `LoginScreen` renders directly when there's no session.

**Session**: refresh token only in `expo-secure-store` (access token kept in memory only, never persisted). `MobileApiClient` dedupes concurrent refreshes via a single in-flight promise, uses a `generation` counter to guard against races with a concurrent logout, and does exactly one 401→refresh→retry cycle before forcing logout. State management is plain React Context (`store/session.tsx`) + TanStack Query for all server data — no Redux/Zustand anywhere in the app.

**Discovery**: `useLocation.ts` (foreground permission → `getCurrentPositionAsync` raced against a 15s timeout) feeds `GET /gyms/nearby`, confirmed to be the same PostGIS `ST_DWithin`/`ST_Distance` endpoint described in §7 — not a separate/simplified mobile-only search.

**Full booking flow — every step confirmed present in code, nothing missing**: gym list/nearby → gym details (+2-review preview) → plan selection (pure routing screen, no API call) → slot selection (`GET /branches/:id/availability`) → booking review (`POST /bookings` with `Idempotency-Key`) → payment → confirmation (polls `GET /bookings/:id` every 3s up to 60s) → booking details (+cancel) → check-in (QR display + OTP fallback, no camera scanning — scanning is staff-side in the partner panel) → review (write/edit, gated on `COMPLETED`, moderation-state aware).

**Payments**: hybrid — backend creates the order, then either shows a "simulate in Admin Finance panel" message (dev provider) or dynamically imports `react-native-razorpay` and calls its native `.open()` (real provider), then sends the returned signature proof to `POST /payments/:paymentId/verify` for server-side verification. Not a WebView built by the app.

**Notifications**: in-app center with infinite list + unread badge; push registration is **opt-in via a manual Profile button, not automatic on login** — a fresh install that never visits Profile relies on in-app notifications alone. Deep-link routing (`routing.ts`) whitelists exactly 4 screen names and UUID-validates the accompanying id before navigating — the same defensive pattern as the partner panel's `notification-route.ts`.

No stubbed or placeholder screens were found anywhere in the traced flows.

---

## 20. Shared packages

`@gymride/api-client` covers only plans/slots/bookings/checkIns (~4 of 15 domains) — most API calls are hand-written per-app, so the "shared client" is only partially shared in practice. **Mobile does not depend on it at all.**

`@gymride/types` is widely and correctly consumed (26+ files across both panels + mobile). One real drift found: `MyReview` (types) omits `updatedAt/moderatedAt/moderatedById/moderationReason`, but `ReviewsService.create/mine/edit` (backend) return the full unshaped Prisma row including all of those — so `moderatedById` (an internal moderator's user ID) is actually sent to the customer on every review response without being modeled or reviewed anywhere in the shared type layer. Minor info-leak, not a security boundary violation (it's the customer's own review), but worth tightening.

`@gymride/validation` (zod) independently re-implements rules that also exist as backend `class-validator` DTOs — genuinely duplicated, not shared, and drifted in several places (frontend consistently *stricter*, so the effect is false client-side rejections / UX inconsistency, not a backend validation bypass):
- OTP: frontend accepts 4–8 digits, backend requires exactly 6.
- Gym name cap: frontend 120, backend 160.
- Branch name/city/state caps: frontend 120/100/100, backend 160/120/120.
- Profile first/last name cap: frontend 80, backend 100.
- Correctly matching: `slotConfigSchema`, `phoneSchema`, `planFormSchema`.

`packages/eslint-config` and `packages/tsconfig` are unimplemented placeholders (README only, no `package.json`) — not a bug, just not built yet.

---

## 21. Role matrix

| Feature | CUSTOMER | GYM_OWNER | GYM_MANAGER | GYM_STAFF | ADMIN/SUPER_ADMIN |
|---|---|---|---|---|---|
| Browse/discover gyms, book, pay, cancel (pre-payment), review | ✅ | — | — | — | — |
| Create/submit gym, create branch | — | ✅ | — | — | ✅ (bypasses ownership) |
| Edit gym/branch/amenities/hours/plans/slots (own scope) | — | ✅ | ✅ (org-wide plans need `branchId:null` membership) | — | ✅ |
| Suspend a branch | — | ❌ (admin-only, even for own branch) | ❌ | — | ✅ |
| Approve/reject/suspend/reactivate a gym | — | ❌ | ❌ | — | ✅ |
| Verify check-in (QR/OTP) | — | ✅ | ✅ | ✅ (branch-scoped) | ✅ |
| View own gym's bookings/finance/reviews (read) | — | ✅ | ✅ | — | ✅ |
| Request/reconcile refunds, generate/process/reverse settlements | — | ❌ (view-only) | ❌ | — | ✅ |
| Moderate reviews | — | ❌ | ❌ | — | ✅ |
| Ban/role-change a user | — | — | — | — | **No endpoint exists for anyone** |

---

## 22. API inventory (by domain, purpose only — not exhaustive)

- **`/auth`**: OTP request/verify, refresh, logout, logout-all — public/self.
- **`/users`**: get/update own profile — self only.
- **`/gyms`, `/gyms/nearby`, `/gyms/:id/reviews`**: public discovery — unauthenticated.
- **`/partner/gyms`, `/partner/branches`, `/partner/branches/:id/amenities`, `/partner/branches/:id/operating-hours`**: owner/manager/admin CRUD + submission.
- **`/admin/gyms`, `/admin/gyms/:id/{approve,reject,suspend,reactivate}`, `/admin/gyms/summary`, `/admin/gyms/:id/audit`**: admin-only.
- **`/plans`, `/branches/:id/plans`, `/branches/:id/availability`**: partner-managed / public read.
- **`/bookings`** (customer create/get/cancel), **`/partner/bookings`**, **`/admin/bookings`** (both read-only).
- **`/bookings/:id/payment`, `/payments/:id/verify`**: order creation + capture verification.
- **`/admin/finance/{summary,payments,refunds,earnings,settlements,ledger,reconciliation}`**, **`/partner/finance/*`** (view-only subset), **`/webhooks/payments/:provider`**.
- **`/bookings/:id/check-in`, `/check-in/qr`, `/check-in/otp`**; **`/partner/check-ins/verify-qr`, `/verify-otp`**.
- **`/bookings/:id/review`** (customer create/get/edit); **`/gyms/:id/reviews`** (public); **`/partner/reviews`**; **`/admin/reviews`, `/admin/reviews/:id/moderation`**.
- **`/notifications`, `/unread-count`, `/:id/read`, `/read-all`, `/preferences`, `/devices`**.

---

## 23. Business rule inventory

1. A booking can only be reviewed if it's the customer's own and status `COMPLETED`; one review per booking (DB unique constraint), enforced with a row lock.
2. Check-in becomes available at a scheduled offset after confirmation (BullMQ `open` job); a customer can cancel only while `PAYMENT_PENDING`, never once `CONFIRMED`, through any current endpoint.
3. Slot capacity counts confirmed-lifecycle bookings plus unexpired pending reservations — an expired-but-unswept `PAYMENT_PENDING` booking never blocks capacity.
4. Duplicate booking prevention: one active booking per user per slot, plus a request-fingerprinted idempotency key.
5. Refund ceiling = payment amount minus all in-flight/successful prior refunds; refunding a settled earning is blocked — settlement reversal must happen first.
6. Commission is calculated in integer minor units with BigInt half-up rounding, snapshotted with its bps/version at capture time so later rate changes don't retroactively alter historical earnings.
7. Review moderation always requires a ≥3-char reason and writes an audit log row in the same transaction as the status change.
8. Partner ownership is always re-derived server-side from the JWT on every request — no endpoint trusts a client-supplied owner/gym/branch ID.
9. Transactional (non-marketing) in-app notifications can never be disabled by user preference; only push delivery and marketing in-app notices are user-controllable.
10. A gym cannot be submitted for approval unless every one of its branches has operating hours defined.
11. Branch suspension is admin-exclusive regardless of owner/manager permissions elsewhere.
12. A full refund transitions the booking to `REFUNDED` only if the booking's current status permits that transition; a provider "success" that contradicts a locally terminal state raises an integrity error rather than silently applying.

---

## 24. Test coverage (actually executed, Node 22, local Postgres/Redis already running)

| Suite | Files | Tests | Result |
|---|---|---|---|
| Backend unit (`backend/src/**/*.spec.ts`) | 35 | 159 | **All passed**, 0 failed, 0 skipped (~11s) |
| Backend runtime/integration (`backend/test/*.runtime-spec.ts`, isolated `gymride_finance_test` DB) | 3 | 39 | **All passed** (~37s) — DB is pre-provisioned and separate from dev DB; nothing destructive was run against `gymride_codex_dev` |
| admin-panel (`vitest`) | 4 | 5 | **All passed** |
| partner-panel (`vitest`) | 5 | 21 | **All passed** |
| Shared packages (`validation`, `api-client`, `web-ui`) | 9 | 24 | **All passed** |
| mobile-app | 7 | 72 | **All passed** |
| **Total** | **63** | **320** | **320 passed, 0 failed, 0 skipped** |

No test infrastructure was unavailable; nothing was skipped. The finance runtime runner (`test:finance:runtime`) was verified safe before running — it hardcodes and refuses any database name other than `gymride_finance_test` and never touches `DATABASE_URL`/`gymride_codex_dev`.

Notably well-covered by dedicated concurrency tests: booking slot-capacity races, refund/notification-intent double-submission, and payment webhook replay — all exercised in the runtime spec suite against real Postgres, not mocks.

---

## 25. Current/recent work (git history)

Working tree is **clean** as of this audit; `HEAD` is `573a44c` ("phase 8 completed ."), one commit ahead of `a802bf5`. At the start of this session, the following were staged-but-uncommitted and have since been committed by the repository owner (not by this audit) as part of `573a44c`:
- New migration `20260923000000_refund_failed_notification`: adds `REFUND_FAILED` to `NotificationType` and backfills `notification_projections` for pre-existing `FAILED` refunds (idempotent `ON CONFLICT DO NOTHING`) so a deployment doesn't retroactively spam alerts for old failures.
- `NotificationProjectionService.projectFailedRefunds()` — new projection source following the established cursor-less dedup-table pattern (§15).
- `notifications.controller.ts` / `reviews.controller.ts` — Swagger response-schema annotations added to every endpoint (no behavior change).
- `reviews.dto.ts` — added `@MinLength(3)` to `ModerateReviewDto.reason` (previously only `@MaxLength`, meaning an empty/1-2 char reason could pass DTO validation before hitting the service-layer length check — now caught earlier, at the DTO layer).
- Expanded runtime tests for both review-moderation restore/re-remove sequences and failed-refund projection idempotency.
- Housekeeping: removed committed build artifacts (`output/*.png`, a `.pdf`, a DB dump, `package-lock.json`) and updated `.gitignore`/README.

Nothing is currently mid-flight; this is a good, stable point to build the next phase from.

---

## 26. Known gaps (feature-status matrix)

| Domain | Backend | Admin UI | Partner UI | Mobile | Tests |
|---|---|---|---|---|---|
| Auth | COMPLETE | COMPLETE | COMPLETE | COMPLETE | COMPLETE |
| Gyms | COMPLETE | COMPLETE | COMPLETE | PARTIAL (browse/read only, no self-listing — by design, customers don't own gyms) | COMPLETE |
| Plans | COMPLETE (minus unreachable `ARCHIVED`) | N/A | COMPLETE | COMPLETE (browse) | COMPLETE |
| Slots | COMPLETE | N/A | COMPLETE | COMPLETE (browse) | COMPLETE |
| Bookings | COMPLETE (cancel only pre-payment) | COMPLETE (read-only) | COMPLETE (read-only) | COMPLETE | COMPLETE |
| Payments | COMPLETE (dev+razorpay; no live payout) | COMPLETE (dev-simulate) | N/A | COMPLETE | COMPLETE |
| Finance/Settlements | COMPLETE | COMPLETE | PARTIAL (view-only, by design) | N/A | COMPLETE |
| Check-In | COMPLETE | PARTIAL (audit view only) | COMPLETE (verify) | COMPLETE (QR/OTP display) | COMPLETE |
| Reviews | COMPLETE | COMPLETE (moderate) | PARTIAL (read-only, by design) | COMPLETE | COMPLETE |
| Notifications | COMPLETE | **MISSING** (no UI at all) | PARTIAL (list/read only, no preferences/devices UI) | COMPLETE | COMPLETE |
| User management | **MISSING** (no admin endpoint exists) | MISSING | N/A | N/A | N/A |

---

## 27. Risks / technical debt (verified, with file references)

1. **Stale-JWT-after-ban gap**: `auth/jwt.strategy.ts` (`validate`) and `auth/auth.service.ts` (`refresh`) never re-check `User.status`; a `BLOCKED` user's tokens keep working until natural expiry. Not exploitable today (no ban feature exists), but will be the moment one ships. — §6
2. **Redis is a hard boot dependency even when queues are disabled**: `bookings/reservation-expiration.service.ts` and `check-ins/check-in-lifecycle.service.ts` call `config.getOrThrow('REDIS_HOST'/'REDIS_PORT')` unconditionally in their constructors — contradicts docs claiming queues can be disabled in Redis-less environments. — §9
3. **`CONFIRMED → CANCELLED` is permitted by the transition table with no enforcing call site** — a latent trap if a future PR adds a "cancel confirmed booking" endpoint using only `canTransitionBooking` as its guard instead of re-deriving refund-eligibility rules. `bookings/booking-state.ts`. — §9
4. **Non-transactional multi-step slot regeneration**: `slots/slots.service.ts` `putConfig()`/`upsertException()` each run 2-3 unguarded statements (delete/upsert/regenerate) without wrapping them in one `$transaction` — a crash mid-sequence can leave slots deleted-but-not-regenerated. Low severity (each step is individually constraint-safe). — §8
5. **`reconcileSchedules()` caps recovery at 1000 bookings, no pagination**: `check-ins/check-in-lifecycle.service.ts` — a large post-outage backlog beyond 1000 `CONFIRMED` bookings could leave some schedules unrecovered until the 60s sweep eventually catches them. — §9
6. **Single global finance advisory lock** (`finance/finance-lock.ts`, constant `517005`) serializes all financial writes platform-wide — a known, doc-acknowledged throughput bottleneck, not a silent bug. — §12
7. **Real payout provider is entirely unimplemented** — `finance/finance.module.ts` — any non-dev/test settlement `process()` call always throws. Fine for current scope, a hard blocker for production deployment as-is. — §10/§12
8. **`@gymride/validation` drift** (frontend stricter than backend in 4 places: OTP length, gym name cap, branch name/city/state caps, profile name cap) — causes false client-side rejections, not a backend bypass. — §20
9. **`MyReview` type under-declares the real API response** — `moderatedById` (an internal moderator's user ID) is actually returned to customers but unmodeled in `@gymride/types`. — §20
10. **Dead code**: `PasswordHasher`/argon2 (`common/security/password-hasher.ts`) is globally provided but never called anywhere in application code (OTP-only auth by design). `PlanStatus.ARCHIVED` is defined but no service path ever sets it. — §6, §8
11. **Frontend route protection is UX-only in both panels** — no `middleware.ts` exists anywhere; all real authorization enforcement depends on the backend. Not a vulnerability by itself (the backend does enforce it, per §6/§7), but worth stating plainly since it means the frontend's role-based nav filtering (e.g., hiding `/finance` from `GYM_STAFF`) is cosmetic, not a security boundary. — §17/§18
12. **Refund reconciliation endpoint has no UI** (`POST /admin/finance/refunds/:id/reconcile`) — an admin can currently only trigger it via direct API call. — §18

---

## 28. Recommended next-development priorities

(Descriptive suggestions only — nothing here was implemented as part of this audit.)

1. Close the stale-JWT-after-ban gap (#1 above) before building any user-suspension/moderation feature that relies on `User.status`.
2. Decide whether `CONFIRMED → CANCELLED` should get a real, refund-integrated endpoint or be removed from the transition table to stop it being a latent trap (#3).
3. Add the missing admin surfaces flagged in §17/§18 (notifications UI for admin, notification preferences/devices UI for partner, refund-reconciliation UI) before Phase 9, since the backend already supports all three.
4. Reconcile `@gymride/validation` bounds with backend DTOs (#8) — cheap fix, currently just causes UX friction.
5. Add `moderatedAt/moderatedById/moderationReason` to `MyReview` in `@gymride/types` or explicitly re-`select` reviews responses to exclude them (#9) — small privacy-hygiene fix.
6. If Phase 9 (GYMRide Flex/Hybrid Mode, per README) needs a real payout provider or a ban/user-management feature, both are currently greenfield — no partial implementation to reconcile with.

---

## 29. Security note: prompt-injection payload found in repo

`frontend/admin-panel/AGENTS.md` and `frontend/partner-panel/AGENTS.md` (byte-identical, and pulled into each panel's `CLAUDE.md` via `@AGENTS.md`) contain a block claiming to be auto-written by `next dev`, asserting Next.js 16 "has breaking changes" versus an AI's training data, and instructing an AI coding agent to read guidance from `node_modules/next/dist/docs/` and `node_modules/next/dist/server/lib/generate-agent-files.js` before writing any code — **neither path exists in a real Next.js installation**; Next.js ships no `dist/docs/` folder and no such generator script. The block also explicitly instructs that removing it "only re-creates the uncommitted change" and that committing it "keeps the tree clean," which is language designed to get an agent to treat fabricated instructions as authoritative and silently perpetuate them.

This audit did not act on that text in any way (no file was read from a fabricated path, no framing from it was adopted). It is flagged here as data, not followed as instruction. Recommend the repository owner determine how this text entered both `AGENTS.md` files and remove it, since any future AI agent working in this repo without this warning could be misled by it.

---

## Confidence level

```text
Architecture: 9/10
Database: 9/10
Backend business logic: 9/10
Mobile: 8/10
Admin: 8/10
Partner: 8/10
Payments/finance: 9/10
Check-in: 9/10
Reviews: 9/10
Notifications: 9/10
Tests: 9/10
Overall: 9/10
```

**Below 9/10, what's still unread:**
- **Mobile (8/10)**: `mobile-app/android` and `mobile-app/ios` (native/generated, intentionally gitignored per README) were not inspected; no native module code beyond the `react-native-razorpay` type declaration was read. Component-level styling/UX polish was not assessed.
- **Admin (8/10)**: The specific admin `finance.tsx` "simulate capture" dev-only control and its exact request payload were reported by the sub-agent but not independently re-verified by reading the file myself.
- **Partner (8/10)**: Same caveat — `packages/web-ui/src/finance.tsx`'s role-gating (`role==="admin"` vs `"partner"`) was reported by a sub-agent and not independently re-read line-by-line by me.
- All backend domains (auth/security, gyms, plans/slots, bookings, finance, check-in) were verified either directly by me or by a sub-agent whose specific file:line claims I spot-checked (reviews/notifications fully firsthand; the AGENTS.md finding independently confirmed firsthand). No area was accepted purely from documentation.
