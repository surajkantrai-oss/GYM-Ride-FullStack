# Booking engine

## Scope

Phase 4 implements plans, finite slot inventory, temporary capacity reservations, booking history, cancellation, and expiration. It deliberately stops at `PAYMENT_PENDING`; payment confirmation, failures from a real provider, refunds, and settlement accounting belong to Phase 5.

## Plans and branch assignment

`GymPlan` belongs to a gym and uses relational `PlanBranch` rows for valid locations. Public APIs return only `ACTIVE` plans whose gym is approved. A booking copies the plan name, type, price in minor units, and currency, so later plan edits never rewrite commercial history.

The MVP uses explicit fixed terms: day pass 1 day, monthly 30 days, quarterly 90 days, and yearly 365 days. These are not calendar-month subscriptions. Phase 5+ may introduce calendar terms without changing historical snapshots.

## Slot architecture

Each branch has at most one `BranchSlotConfig`. Slots are materialized only from today through the configured 1–90 day booking window. Generation combines IANA branch timezone, split operating-hour periods, and closed-date exceptions. Timestamps are persisted in UTC. Luxon performs timezone and daylight-saving conversion; fixed offsets are never embedded.

Only complete slots are created. A 06:00–08:30 period with 60-minute duration produces 06:00–07:00 and 07:00–08:00, dropping the final partial period. A configuration change deletes and regenerates only future slots without bookings. Historical slots and booked future slots remain untouched.

```text
Branch timezone + operating hours + closed-date exceptions
                         |
                         v
              finite rolling horizon
                         |
                         v
               UTC SlotInstance rows
```

## Capacity and concurrency

Availability uses one grouped database read. Confirmed/check-in lifecycle bookings consume capacity. `PAYMENT_PENDING` consumes capacity only while `reservationExpiresAt` is in the future. Therefore an overdue job can never hold capacity indefinitely.

```text
available = capacity - confirmed lifecycle bookings - unexpired pending bookings
```

Redis provides a short best-effort `booking-lock:{slotId}` lock to reduce contention. PostgreSQL remains authoritative:

```text
Customer
   |
   | POST /bookings + Idempotency-Key
   v
BookingService
   |
   | best-effort Redis lock
   v
PostgreSQL transaction
   | SELECT slot FOR UPDATE
   | validate plan / branch / window
   | count active capacity
   | reject duplicate or full slot
   | create PAYMENT_PENDING booking + event
   v
BullMQ delayed expiration job
```

The row lock lasts for the transaction, so competing reservations for the same final place serialize and re-check current usage. Redis failure reduces efficiency but cannot permit overselling.

## Idempotency

Booking creation requires an `Idempotency-Key` of 8–120 characters. `(userId, idempotencyKey)` is unique. A SHA-256 request fingerprint binds the key to plan, branch, and slot. An identical retry returns the original booking; a changed request returns `IDEMPOTENCY_KEY_CONFLICT`. Keys are retained with booking history rather than expiring independently.

## Reservation lifecycle and jobs

The reservation TTL defaults to ten minutes and is environment configurable. BullMQ uses deterministic job IDs, exponential retry, bounded retained job history, structured failure logs, and an idempotent processor. Production enables the queue by default; local environments can disable it when Redis is unavailable.

At execution the worker conditionally updates only a still-`PAYMENT_PENDING` booking whose deadline has passed, and writes `BOOKING_EXPIRED` in the same transaction. Replayed or late jobs do nothing.

## State machine

Modeled statuses:

```text
CREATED -> PAYMENT_PENDING
PAYMENT_PENDING -> CONFIRMED | EXPIRED | PAYMENT_FAILED | CANCELLED
CONFIRMED -> CANCELLED | CHECK_IN_AVAILABLE
CHECK_IN_AVAILABLE -> CHECKED_IN | NO_SHOW
CHECKED_IN -> COMPLETED
PAYMENT_FAILED -> REFUNDED
```

Phase 4 performs `CREATED -> PAYMENT_PENDING`, `PAYMENT_PENDING -> EXPIRED`, and `PAYMENT_PENDING -> CANCELLED`. Payment and refund transitions are modeled and tested as policy but are not exposed through fake production endpoints.

## Authorization and tamper resistance

Customers derive `userId` from the access token and may read/cancel only their bookings. Partners must select a gym or branch and pass existing resource authorization; details re-check branch management. Administrators have read-only platform visibility. The backend derives price, currency, status, gym, and capacity from trusted records and verifies that plan, branch, and slot belong together.

## Availability exceptions

`BranchAvailabilityException` provides relational closed-date foundations for holidays, maintenance, private events, and temporary closures. Closed dates mark unbooked slots unavailable using branch-local day boundaries. Custom shortened periods are intentionally deferred.
