# Domain model

```text
User ─< UserRole >─ Role
 │
 ├─ owns ─< Gym ─┬─< GymBranch ─┬─< BranchAmenity >─ Amenity
 │               │              ├─< OperatingHours
 │               │              ├── BranchSlotConfig
 │               │              ├─< BranchAvailabilityException
 │               │              └─< SlotInstance ─< Booking
 │               └─< GymPlan ─< PlanBranch >─ GymBranch
 └─ books ─< Booking ─< BookingEvent
```

`Gym` is a legal/business concept; `GymBranch` is a physical place with contact details, timezone, status, coordinates, amenities, and opening periods. Keeping them separate supports chains without duplicating business ownership.

Roles are data-backed and joined through `UserRole`, avoiding brittle booleans and allowing several roles per user. Fine-grained permissions can later be introduced with `Permission`, `RolePermission`, and context-aware ownership checks without rewriting identity records.

Amenities use an explicit many-to-many join so they are searchable, normalized, and extensible. Operating hours use a `(branch, weekday, period)` uniqueness rule; multiple periods allow split schedules. A future `SpecialOperatingHours` model can override a date for holidays or temporary closures.

All entity IDs are UUIDs and timestamps are UTC `timestamptz`. Each branch carries an IANA timezone for translating local wall-clock opening hours.

## Geospatial storage

Latitude and longitude are validated decimal inputs. A database trigger derives `location geography(Point, 4326)` using longitude first, then latitude. A GiST index supports meter-based `ST_DWithin` radius queries and `ST_Distance` ordering without loading all branches into Node.js. Map bounds can use an indexed geometry envelope strategy when the endpoint is implemented.

Prisma represents `location` as `Unsupported`; repository helpers will use parameterized `$queryRaw` SQL for PostGIS expressions. The initial migration enables PostGIS, creates the trigger, and creates the spatial index. Never interpolate coordinates into raw SQL strings.

## Plans, slots, and bookings

`GymPlan` owns the commercial offer and stores its authoritative price in integer paise. `PlanBranch` is the relational assignment between a plan and the branches where it can be purchased. Bookings copy the plan name, type, currency, and price so later plan edits cannot rewrite commercial history.

Each branch has at most one `BranchSlotConfig`. `SlotInstance` materializes UTC intervals generated from branch-local operating periods and the branch IANA timezone. The `(branchId, startAt, endAt)` uniqueness constraint makes horizon generation repeatable. Date exceptions are unique per branch and local calendar date.

`Booking` owns the lifecycle and temporary reservation deadline. Capacity consumers are confirmed lifecycle states plus `PAYMENT_PENDING` rows whose deadline has not passed. A row lock on the slot serializes the final capacity recheck and insert. `(userId, idempotencyKey)` protects request retries; the stored fingerprint detects conflicting reuse. `BookingEvent` is append-only lifecycle history.
