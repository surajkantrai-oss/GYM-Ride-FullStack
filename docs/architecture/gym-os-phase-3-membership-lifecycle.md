# GymOS Phase 3 — Membership Lifecycle

## Scope

Phase 3 adds gym-managed membership plans and a server-authoritative membership lifecycle for the direct members introduced in GymOS Phase 2. It does not add attendance, dues, payment collection, reminders, CRM, or customer-app functionality. GymOS subscriptions remain separate from GYMRide marketplace plans and bookings.

## Domain model

- `GymOsMembershipPlan` is scoped to one gym and defines a code, name, duration, reference price, currency, optional branch applicability, and `DRAFT → ACTIVE → INACTIVE/ARCHIVED` catalogue state.
- `GymOsMembershipPlanBranch` restricts a plan to selected branches. An empty set means all current gym branches.
- `GymOsMembership` belongs to a direct `GymMember` and snapshots all commercial and applicability fields at assignment time. Later plan edits never rewrite history.
- `GymOsMembershipEvent` is an append-only lifecycle journal. Administrative operations also write the shared audit log.

All monetary fields use integer minor units. Membership dates use PostgreSQL `date`, not instants.

## Date convention

Membership periods are inclusive. A plan beginning on 1 October with a three-month duration ends on 31 December. Days and weeks add `duration - 1` calendar days. Months use a clamped calendar-month calculation and then subtract one day, which is equivalent to a half-open `[start, start + duration)` interval represented with an inclusive end date. Gym-local “today” uses the first branch timezone, falling back to `Asia/Kolkata` when a gym has no branch.

## Lifecycle

Assignment creates `ACTIVE` when the start date is today or earlier and `SCHEDULED` when it is later. Request-time reconciliation and the existing bounded hourly lifecycle sweep:

- expire `ACTIVE` memberships whose end date is before gym-local today;
- then activate eligible `SCHEDULED` memberships;
- never auto-expire `FROZEN` memberships.

Valid operator actions are:

- `ACTIVE → FROZEN` with a required reason;
- `FROZEN → ACTIVE`, extending the inclusive end date by frozen days;
- `ACTIVE | FROZEN | SCHEDULED → CANCELLED` with a required reason;
- renewal creates a new linked membership and never overwrites the old record.

`EXPIRED` and `CANCELLED` are terminal. A full history remains available on the member profile.

## Concurrency and integrity

PostgreSQL is authoritative. Transactions take advisory locks for member assignment or lifecycle records. Exclusion is enforced twice: overlap checks provide a stable domain error, while partial unique indexes allow at most one `ACTIVE/FROZEN` and one `SCHEDULED` membership per member. The renewal link is unique, preventing concurrent duplicate renewals. Serializable transaction conflicts and uniqueness races are mapped to stable membership conflict errors.

Reconciliation expires ended records before activating scheduled renewals so the active-membership invariant cannot be temporarily violated. Conditional updates make repeated sweeps idempotent.

Expiry filters use exact `TODAY`, `IN_1_DAY`, `IN_2_DAYS`, and `IN_3_DAYS` buckets plus overlapping broad `WITHIN_7_DAYS` and `THIS_MONTH` ranges. `EXPIRED` means `endDate < today`. List responses expose `daysRemaining` as zero today, positive in the future, and negative after expiry.

## Authorization and entitlements

All Partner operations require the gym’s `MEMBERSHIP_MANAGEMENT` entitlement. Owners and managers may mutate plans and memberships. Staff may read plans, membership lists, expiry dashboards, and member history but cannot perform lifecycle mutations. Existing gym-resource authorization protects all identifiers against cross-gym access. Admin endpoints are platform-role protected and read-only.

## APIs

Partner routes are under `/api/v1/partner/gyms/:gymId/gym-os`:

- membership plan list, detail, create, update, activate, deactivate and archive;
- member membership assignment, history and current membership;
- membership list and expiry summary;
- freeze, resume, cancel and renew.

Admin routes under `/api/v1/admin/gym-os` provide read-only plan and membership list/detail access. DTO validation, bearer authentication and role requirements are represented in Swagger.

## Portal behavior

The Partner Portal includes plan catalogue management, member-profile assignment and history, lifecycle actions, filters, and expiry summary cards. The Admin Portal provides cross-gym read-only plan, membership, snapshot and event visibility. No direct member data is exposed to the customer mobile application.

## Deliberately deferred

Attendance/check-in, dues and collections, automated renewal reminders, CRM, external messaging and GymOS customer mobile experiences remain outside Phase 3.
