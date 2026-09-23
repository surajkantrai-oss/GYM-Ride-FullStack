# Phase 9 — GYMRide Flex / Hybrid Mode

Phase 9 adds a prepaid, fixed-period, multi-city entitlement while preserving the standard gym-plan purchase path. It does not implement recurring billing, recommendations, AI, production deployment, or store release.

## Domain and commercial model

`ServiceCity` is the canonical city catalogue. A customer selects one primary city and an optional distinct secondary city when buying a platform-owned `FlexPlan`. A successful purchase creates an immutable `FlexSubscription` snapshot containing plan name/code, price/currency, duration, eligible plan types, total/city/daily limits, booking window, and policy version. Later plan edits do not change active subscriptions. Only one active or pending logical subscription is permitted per customer by a partial PostgreSQL unique index.

Flex uses the existing `PaymentProvider` abstraction. The backend creates a provider order from the server-side plan price and activates the subscription only after provider signature, order, amount, currency, ownership, and captured status verification. The development provider is explicitly simulated; no real payment is claimed. Refund policy is intentionally not invented: the separate Flex payment reference is extensible for refunds, but no customer/admin Flex-refund endpoint exists until usage-aware eligibility and product terms are approved.

## Participation and eligibility

`GymFlexParticipation` is an explicit, branch-level opt-in controlled by an authorized owner/manager. It maps a branch to a canonical city and allowed plan types. Partners may enable/disable participation but cannot set compensation. Admin-owned `FlexReimbursementRule` records positive minor-unit compensation, currency, version, and effective dates.

`FlexUsagePolicy` applies canonical city membership and configurable total, per-city, and daily limits. Booking additionally validates an active, unexpired subscription/period; approved gym; active branch; active plan; allowed plan type; enabled participation; effective reimbursement rule; future slot inside the advance/period window; and existing slot capacity. Clients cannot assert Flex eligibility, price, city, allowance, or reimbursement.

## Reservation, check-in, and concurrency

Initial Flex supports timed `DAY_PASS`-compatible slots only. A successful Flex booking is immediately `CONFIRMED`, has explicit `Booking.source = FLEX`, records the normal plan list price separately from `customerChargeMinor = 0`, and snapshots subscription, period, city, and reimbursement data. A unique `FlexUsage.bookingId` begins as `RESERVED`.

PostgreSQL serializable transactions plus subscription and slot row locks make allowance and capacity authoritative. `RESERVED`, `CONSUMED`, and `FORFEITED` usage all occupy entitlement; cancellation changes a reservation to `RELEASED`; a no-show changes it to `FORFEITED`. Therefore simultaneous requests cannot spend the last visit twice. Idempotency keys protect purchase and booking retries, and database uniqueness prevents duplicate subscription purchases, usage rows, payment references, and earnings.

Flex reuses the Phase 7 lifecycle. At verified QR/OTP check-in, the booking transition, `FlexUsage = CONSUMED`, `GymEarning`, append-only `FLEX_REIMBURSEMENT` ledger entry, and notification intent commit in one transaction. The earning snapshots the reimbursement as gross/net with zero platform commission for the current fixed-rule model. Phase 5 settlements select eligible standard-payment and consumed-Flex earnings without creating a parallel payout system.

## APIs and authorization

Customer routes under `/api/v1/flex` list active plans/cities, create and verify a subscription purchase, return the caller's subscription/usage, discover server-filtered eligible gyms, and create/cancel Flex bookings. Purchase and booking writes require `Idempotency-Key`. Customer responses do not expose reimbursement contracts.

Partner routes under `/api/v1/partner/flex` provide authorized summary, bookings, usage, earnings, canonical cities, and participation reads/updates. Every gym/branch filter is checked through `GymAccessService`; unauthorized resources are returned as not found/forbidden according to existing IDOR policy. Partners cannot modify rules, usage, earnings, or ledger rows.

Admin routes under `/api/v1/admin/flex` provide aggregate summary; plans and canonical city management; subscription, usage, and participation lists; and reimbursement-rule creation. Configuration changes create audit records. Active subscription snapshots and historical usage/financial rows are not destructively edited.

## Mobile and portals

Customer mobile has a dedicated Flex entry point. It loads real plans/cities, performs provider-backed purchase (clearly simulated only under the development provider), displays active entitlement and eligible branches, and carries an explicit internal Flex mode through gym → plan → slot → review. The backend still determines eligibility. Successful Flex reservations go directly to booking details rather than booking-payment checkout. Controlled notification routing supports only the internal `Flex` destination.

The Partner Portal exposes summary, activity, earnings, and branch participation against authorized gyms. The Admin Portal exposes platform metrics, plan/city creation, and operational subscription/usage/participation views. Both use backend pagination/aggregation and provide loading, empty, and error states.

## Database and validation

Migration `20260924000000_flex_hybrid` creates the models, enums, foreign keys, indexes, check constraints, and partial unique subscription constraint, and extends booking, earning, ledger, audit, and notification types. Minor-unit amounts remain integers. Runtime tests recreate only the guarded local `gymride_finance_test` database, provision PostGIS, apply every migration, and exercise real concurrent entitlement reservation, activation/idempotency, city rejection, release/reuse, check-in consumption, reimbursement earning, and ledger integration alongside all earlier runtime suites.

Known limitations: recurring renewal, proration/refunds, same-gym frequency policy, capacity reserved specifically for Flex, subscription pause, and automated expiry/expiring reminders are extension points rather than implemented product rules. Timed slots remain mandatory. Real Razorpay acceptance, physical-device Expo push acceptance, production payout, production signing, and deployment remain external validations.
