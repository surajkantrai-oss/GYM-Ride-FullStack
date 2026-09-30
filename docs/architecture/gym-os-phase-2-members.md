# GymOS Phase 2 — Member Management

## Scope and domain boundary

`GymMember` is a gym-owned directory record for direct/offline members. It is not a GYMRide login account. Its optional `userId` supports future explicit linking without creating users or changing authentication. Phase 2 contains no membership product, expiry, attendance, dues, renewals, trainers, CRM or messaging.

## Data and lifecycle

Members belong to one gym and may reference a primary branch from that same gym. Statuses are `ACTIVE`, `INACTIVE` and terminal `ARCHIVED`. Active means the directory record is active, not that a future membership is paid or unexpired. No records are hard-deleted.

Phones are normalized to E.164 and unique per gym, including archived history. Email is optional, trimmed and lower-cased. Human codes use the PostgreSQL `gym_os_member_code_seq` (`GM-000001`) rather than unsafe count-based numbering; authorization never relies on this code.

## Entitlements, limits and concurrency

Every Partner member endpoint requires an active/trial GymOS subscription with `MEMBERS`. ACTIVE records count toward the snapshotted plan limit; INACTIVE and ARCHIVED records do not. A PostgreSQL transaction advisory lock keyed by gym serializes create, reactivation and import capacity decisions. Database uniqueness is the final duplicate guard. Downgrades never remove data: over-limit usage is reported and creation/reactivation remains blocked until usage is within the limit.

Expired subscriptions retain data but block Partner member APIs. Admin support visibility remains read-only.

## Roles and security

- Owner and Manager: view, create, edit, deactivate, reactivate, archive and import.
- Staff: read-only directory access.
- Admin/Super Admin: read-only cross-gym oversight with minimal fields; private notes are excluded.

Gym access is checked before member lookup to prevent IDOR. Branch assignments require the same gym. Audit records contain identifiers and changed field names, not full PII or notes.

## CSV import

CSV is submitted as bounded UTF-8 text, never stored. Required headers are `firstName` and `phone`; optional fields are `lastName`, `email`, `primaryBranchId`, and `joinedAt`. Preview validates without mutation. Import revalidates and commits all rows atomically. Limits are 1 MB and 1,000 rows. Reports include row/field errors and counts. Formula text remains inert plain text.

## UI and future integration

Partner GymOS Members provides summary metrics, search, filtering, pagination, profile editing, lifecycle actions, capacity warnings and CSV preview/import. Admin provides read-only oversight. Phase 3 may attach membership products and lifecycle records to `GymMember`; it must not overload member status with expiry or freeze semantics.
