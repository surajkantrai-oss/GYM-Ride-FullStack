# GymOS Phase 1 — SaaS Foundation

## Purpose and scope

GymOS is a paid, gym-scoped SaaS add-on inside the existing Partner Portal. Phase 1 provides commercial plans, subscription purchase and verification, trials, immutable commercial snapshots, entitlement checks, cancellation, expiration, Admin oversight, audit records and transactional notifications. Existing marketplace features remain independent.

Phase 1 deliberately does not create gym members, memberships, attendance, renewals, member payments, staff administration, CRM, WhatsApp, SMS or campaign tooling.

## Data model and plans

- `GymOsPlan` stores platform commercial configuration in minor currency units.
- `GymOsPlanFeature` stores stable typed feature codes relationally.
- `GymOsSubscription` belongs to one `Gym` and retains immutable plan, price, currency, limits, trial and feature snapshots.
- `GymOsPayment` is separate from booking payments but uses the shared `PaymentProvider`.
- A partial PostgreSQL unique index allows only one open subscription per gym.

Default plans are seeded idempotently: Starter ₹599/month (14-day trial, 1 branch, 150 members), Growth ₹1,299/month (3 branches, 500 members), and Pro ₹2,299/month (20 branches, 5,000 members). Database plan records are authoritative.

## Lifecycle, billing and trials

`PENDING_PAYMENT → ACTIVE → EXPIRED` is the paid fixed-period flow. `TRIALING → EXPIRED` is supported when a plan has trial days. Active subscriptions may set `cancelAtPeriodEnd`; pending/trial subscriptions cancel immediately. Admin may move a subscription to `SUSPENDED` with a required reason. Phase 1 does not claim recurring billing, automatic renewal or proration.

The server derives price, currency, duration, limits and features. Development purchases use signed sandbox receipts from the existing provider. Razorpay-ready architecture remains available. Verification checks order, amount, currency and captured status before atomic activation.

## Authorization and entitlements

Subscriptions belong to gyms, never directly to users. Existing gym access checks hide cross-gym records. Owners may subscribe and cancel; managers may view status and entitlements; staff receive no GymOS navigation or billing access. Admin/Super Admin have platform oversight.

`GymOsEntitlementService` exposes `getEffectiveEntitlements`, `hasFeature` and `assertFeature`. It validates status and dates at request time. Limits are exposed for future phases, but member counting is not implemented.

## Security, idempotency and concurrency

Purchase requires an `Idempotency-Key`. Unique idempotency, provider order/payment and open-subscription constraints protect concurrent retries. Creation and activation use serializable transactions. Duplicate verification returns the already-activated subscription. Provider secrets never enter DTOs or UI responses.

## Portals, notifications, jobs and audit

Partner `/gym-os` selects a gym and shows either the authoritative plan paywall or subscription state, period, limits and features. Admin `/gym-os` shows summary, plans, subscriptions and suspension controls. Trial start, activation, 7/3/1-day expiry reminders, cancellation and expiration create deduplicated intents through the existing notification outbox. A gym receives a plan trial at most once; a later purchase proceeds directly to payment. Request-time expiry is authoritative; an idempotent hourly sweep accelerates lifecycle reconciliation. Plan and subscription administrative actions use `AuditLog`.

## Testing and future phases

Unit coverage validates active, missing, excluded, included and expired entitlements. Existing authorization, payment, notification, portal and runtime regression suites remain authoritative. Future phases are Members, membership lifecycle, attendance, payments/renewals, and analytics/reminders; none are implemented here.
