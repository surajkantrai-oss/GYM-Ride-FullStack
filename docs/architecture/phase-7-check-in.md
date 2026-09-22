# Phase 7 — Secure QR / OTP gym check-in

Status: implemented for local development and PostgreSQL-backed validation. Phase 8 and later work is outside this document.

## Domain architecture

Phase 7 is a backend-authoritative booking lifecycle. `CheckInPolicy` owns UTC time-window calculations. `CheckInService` owns eligibility, financial-integrity checks, row-locked transitions, safe response projections, completion and no-show. `CheckInTokenService` and `CheckInOtpService` own credentials. `CheckInVerificationService` applies branch authorization before both credential methods converge on `CheckInService.verifyInTransaction`. Controllers only validate transport input and invoke these services.

The booking lifecycle is `CONFIRMED → CHECK_IN_AVAILABLE → CHECKED_IN → COMPLETED`. An unverified `CHECK_IN_AVAILABLE` booking becomes `NO_SHOW`. A timed slot is required in Phase 7; Phase 4 membership purchases have no slot and are therefore not check-in eligible yet.

## Persistence and migration

Migration `20260917000000_secure_check_in` adds:

- one `CheckIn` operational record per booking, with customer, gym, branch, method, verifier and lifecycle timestamps;
- `CheckInToken`, which stores a unique HMAC-SHA-256 hash, expiry and `consumedAt`, never the QR value;
- `CheckInOtpChallenge`, which stores a purpose-bound HMAC hash, attempt ceiling, expiry and `consumedAt`;
- check-in method/status enums and append-only booking event types.

Indexes cover token hash lookup, booking challenge lookup, expiry, branch/status operations and customer history. Booking remains the high-level reservation state and PostgreSQL remains authoritative.

## Window and system transitions

All server comparisons use slot UTC instants. Branch IANA timezone is used only for display. Defaults are configurable:

| Variable                            | Default | Meaning                                         |
| ----------------------------------- | ------: | ----------------------------------------------- |
| `CHECK_IN_OPEN_BEFORE_MINUTES`      |      15 | open before slot start                          |
| `CHECK_IN_CLOSE_AFTER_MINUTES`      |      30 | credential verification closes after slot start |
| `CHECK_IN_COMPLETION_GRACE_MINUTES` |      15 | completion after slot end                       |
| `CHECK_IN_TOKEN_TTL_SECONDS`        |     180 | QR token lifetime                               |
| `CHECK_IN_OTP_TTL_SECONDS`          |     180 | fallback OTP lifetime                           |

`CheckInLifecycleService` creates deterministic BullMQ open, no-show and completion jobs with five bounded exponential retries. A minute sweep and startup reconciliation recover missed schedules. Payment confirmation schedules the booking after the financial transaction commits; schedule failure is logged safely and recovered by reconciliation. Queue execution is controlled by `CHECK_IN_QUEUE_ENABLED`. Request-time synchronization is an idempotent fallback, not a client-decided transition.

## QR flow and replay protection

An eligible authenticated customer calls `POST /api/v1/bookings/:bookingId/check-in/qr`. The server derives booking, customer and branch from the owned booking. It generates 256 random bits, returns the base64url token and stores only a dedicated-secret HMAC. Issuing another token atomically consumes earlier unused tokens.

The mobile app renders the QR locally with pinned `react-native-qrcode-svg@6.3.24` and `react-native-svg@15.15.5`; no external QR service is called. The token remains in component memory and is dropped visually after expiry. It contains no booking ID, PII, role or financial data.

Partner staff submit a decoded value to `POST /api/v1/partner/check-ins/verify-qr`. The service resolves the token's branch, authorizes the current partner, row-locks the booking, validates token expiry/use, window, booking state and captured-payment snapshot, conditionally consumes the token, transitions the booking and records the event in one transaction. Concurrent scans serialize on the booking row; exactly one can change `CHECK_IN_AVAILABLE` to `CHECKED_IN`.

## OTP fallback

The check-in OTP is intentionally separate from login OTP. It is a six-digit server-generated in-app fallback code, displayed only to the authenticated owning customer during the open window. It is never logged or stored in plaintext. Its HMAC binds challenge ID, booking ID and code, providing booking/customer/branch/purpose binding through the associated CheckIn record.

Database-backed cooldown, rolling booking request limit, expiry, maximum attempts, challenge invalidation and single-use consumption protect against brute force and replay. Invalid attempts are committed before a stable error is returned. QR and OTP use the same row-locked verification transition.

## Authorization and IDOR

Customer status and credential APIs always query by `bookingId + authenticated userId`; cross-customer requests return not found. QR input supplies no trusted booking/branch fields. Partner verification permits owners, active managers and active staff, plus administrators, but `GymAccessService.assertBranchCheckIn` additionally requires gym ownership/admin or an active global/matching-branch membership. A Branch A staff account cannot consume a Branch B credential.

`CANCELLED`, `REFUNDED`, `EXPIRED`, `PAYMENT_FAILED`, already checked-in and untimed bookings cannot issue credentials. Eligibility also requires a captured payment whose amount and currency match the immutable booking snapshot and which has not been fully refunded.

## Events and observability

Append-only `BookingEvent` records cover availability, QR issuance, QR verification, OTP issuance, OTP verification, completion and no-show. Metadata contains safe references/timestamps only. QR and OTP values are never written to events, application logs or analytics. Lifecycle structured logs include booking IDs; HTTP logging already redacts token/OTP fields.

## Client workflows

Customer Booking Details links to a Check-In screen for confirmed/active/terminal check-in lifecycle states. The screen loads backend eligibility, displays gym, branch, plan, slot, authoritative window/status, QR countdown/regeneration, OTP fallback, verified time, completion and no-show. Actions disappear once the backend reports an ineligible or terminal state. Network and stable check-in error codes have actionable copy.

The Partner Portal adds `/check-ins` and permits `GYM_STAFF` sessions. Staff navigation is limited to Check-ins/Profile. The page supports scanner-decoded token entry and booking/OTP fallback with ready, pending, success and stable error feedback. It shows only safe customer identity and operational booking fields. Browser camera scanning was deliberately not added; local scanner/token input is the documented integration point.

Partner and Admin booking details show read-only check-in method, status, verifier and timestamps. Neither surface receives token/challenge relations. No admin override was added because no current operational requirement justified it.

## API and Swagger

- `GET /api/v1/bookings/:bookingId/check-in`
- `POST /api/v1/bookings/:bookingId/check-in/qr`
- `POST /api/v1/bookings/:bookingId/check-in/otp`
- `POST /api/v1/partner/check-ins/verify-qr`
- `POST /api/v1/partner/check-ins/verify-otp`

Swagger documents bearer authentication, request DTOs, success schemas, credential expiry/reissue semantics and stable 400/401/403/404/409/429 errors without secret internals.

## Security review

- entropy: 256-bit opaque QR value; six-digit OTP with short lifetime and attempt limits;
- tampering: unknown token hashes fail; only the dedicated check-in HMAC secret validates stored hashes;
- screenshot/replay: short TTL, regeneration revocation, `consumedAt`, conditional update and booking row lock;
- authorization: owned customer queries plus gym/branch-scoped membership checks before consume;
- transition bypass: no customer status mutation API; conditional server transitions only;
- clocks: UTC instant arithmetic; timezone only for rendering;
- sensitive data: no plaintext credential persistence, logging, audit metadata or admin/partner projection;
- concurrency: database row locks/unique constraints; Redis is not required for correctness.

## Testing and runtime boundaries

Unit coverage includes policy boundaries and stable errors, safe booking projections, Swagger/role metadata and branch-scoped staff authorization. Mobile tests cover customer API routes, pre-window/eligible/checked-in UI and existing booking integration. Partner tests cover all operational error-state mappings; Admin tests protect secret-free read-only audit projection.

The isolated PostgreSQL suite performs actual parallel QR verification, OTP verification, completion and no-show calls, plus expiry, replay, tampering, wrong-customer, branch IDOR, OTP attempts and terminal-state checks. BullMQ code is implemented, but Redis worker timing is not claimed as an external distributed-runtime acceptance test when `CHECK_IN_QUEUE_ENABLED=false` locally.

Known existing limitations remain: Razorpay test/live credentials and external payment acceptance are pending, and confirmed-booking cancellation remains unsupported. Phase 7 adds no reviews, notifications, hybrid mode, recommendations, AI, deployment or store-release work.

## Final validation

Validation completed on 2026-09-17:

- `pnpm lint` and the mobile ESLint command passed;
- `pnpm format:check` passed, including Prisma schema validation;
- `pnpm typecheck` passed across all workspace projects;
- `pnpm test` passed 230 unit/component tests;
- the isolated PostgreSQL suite passed 32 finance/check-in runtime tests, including simultaneous verification and lifecycle workers;
- `pnpm build` passed for the NestJS backend and both Next.js portals;
- Android `assembleDebug` completed all 382 Gradle tasks, and the resulting APK installed and launched as the foreground activity in a Pixel 9 emulator;
- the native iOS build succeeded on Xcode 26.3 after extending the pinned ExpoModulesJSI compatibility patch. A subsequent startup crash exposed a null argument pointer for zero-argument JavaScript callbacks; the patch now supplies a non-dereferenced placeholder only when the argument count is zero. After a clean native rebuild and Metro cache reset, the app remained open on the login screen in an iPhone 17 Pro Max simulator, with no new GYMRide crash report. The mobile typecheck, lint, and 60 mobile tests passed again on 2026-09-18.

The combined automated total is 262 passing tests. The Android check above is an installation/startup smoke test; a real-device camera scan and externally timed Redis/BullMQ worker acceptance test remain production-environment validations.
