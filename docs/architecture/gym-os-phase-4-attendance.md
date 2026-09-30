# GymOS Phase 4 — Attendance

## Purpose and domain boundary

GymOS attendance records visits by a gym's direct members. It is deliberately separate from GYMRide marketplace booking check-in: it has its own tables, endpoints, eligibility rules and lifecycle, and never reads or advances a marketplace booking.

## Data model

`GymOsAttendance` links the gym, active branch, direct member and authoritative membership snapshot used at admission. A row opens in `CHECKED_IN` and is updated once to `CHECKED_OUT`; absence is derived from no row. Check-in methods are `MANUAL` and `QR`. Checkout time and duration are not client supplied, and duration is derived in API responses.

PostgreSQL enforces checkout-after-check-in and a partial unique index for one open session per member. Gym, branch, member, membership and time indexes support scoped operational queries. Attendance is never hard deleted.

`GymOsAttendanceQrToken` stores only a SHA-256 token hash. It is gym- and branch-scoped, revocable, and has a database-enforced positive lifetime. The raw 256-bit secret is returned only at generation time.

## Eligibility and branch scope

Every check-in re-runs GymOS subscription/`ATTENDANCE` entitlement checks and membership lifecycle reconciliation. The server then requires an active member, an active membership whose local calendar dates include today, an active branch in the same gym, and membership branch applicability. A member's primary branch is metadata and does not narrow attendance.

Scheduled memberships may become active through request-time reconciliation. Frozen, cancelled and expired memberships cannot check in. Existing history remains available after subscription loss, but Partner attendance operations are entitlement-gated.

Owners and managers can view and operate attendance across authorized gym branches. Staff can view, check in and check out only within their existing branch scope. Admin and Super Admin receive read-only cross-gym oversight. All entity lookups are gym-scoped to prevent IDOR.

## Manual flow

The Partner Portal searches the real member directory and submits only member and branch identifiers. The backend remains authoritative and records the staff actor, method and audit event. Checkout updates the existing open row and creates a second audit event. Concurrent attempts are serialized with PostgreSQL advisory locks and protected by the partial unique index.

## Rotating QR flow

The branch display requests a 60-second token by default (`GYMOS_ATTENDANCE_QR_TTL_SECONDS`). It refreshes every 45 seconds, so two adjacent tokens can overlap briefly until natural expiry. Tokens are reusable by distinct eligible members during that short window, but the one-open-session rule prevents reuse by the same member.

Phase 4 intentionally uses a staff-authenticated QR validation endpoint. No customer/member authentication or public kiosk was invented. The Partner display therefore states the operational fallback: identify the member by code or phone at the front desk. Token comparison is timing-safe; the API validates hash, expiry, revocation, gym, branch, branch activity, entitlement and member/membership eligibility before the transactional insert.

Old, unused tokens are removed by the existing GymOS lifecycle schedule after `GYMOS_ATTENDANCE_QR_RETENTION_HOURS` (24 by default). Used tokens remain as attendance evidence. There is no second queue system and no notification spam.

## Reporting and time

The Partner API exposes paginated history, current presence, member history and today/7-day/30-day summaries. Filters cover date range, branch, member, status, method and member text. Admin has read-only list and per-gym summary APIs.

"Today" is calculated as a real UTC instant range from midnight to midnight in the selected branch timezone, including daylight-saving transitions. A cross-midnight visit belongs to its check-in day for visit reporting; checkout counts use the checkout day. Duration is non-negative and derived from timestamps. The Phase 4 report is intentionally operational rather than retention/churn analytics.

## API surface

- `POST /partner/gyms/:gymId/gym-os/attendance/check-in`
- `POST /partner/gyms/:gymId/gym-os/attendance/:attendanceId/check-out`
- `POST /partner/gyms/:gymId/gym-os/attendance/branches/:branchId/qr`
- `POST /partner/gyms/:gymId/gym-os/attendance/qr/check-in`
- `GET /partner/gyms/:gymId/gym-os/attendance`
- `GET /partner/gyms/:gymId/gym-os/attendance/today`
- `GET /partner/gyms/:gymId/gym-os/attendance/present`
- `GET /partner/gyms/:gymId/gym-os/attendance/summary`
- `GET /partner/gyms/:gymId/gym-os/members/:memberId/attendance`
- `GET /admin/gym-os/attendance`
- `GET /admin/gym-os/attendance/summary`

The API is bearer-authenticated, role guarded, bounded to 100 rows per page and documented in Swagger. Natural database idempotency prevents duplicate retry rows; no new Idempotency-Key store was added.

## User interfaces

Partner GymOS navigation now includes Attendance. The screen includes real KPI cards, current presence with checkout actions, member search/manual check-in, branch selection, rotating QR with countdown/fallback, history search and date/method filters. Member detail includes last visit, 30-day visits, current presence and history. The GymOS overview includes today's check-ins and current presence.

Admin GymOS includes a read-only attendance directory with gym, branch and member filters and no mutation controls.

## Auditing, concurrency and limitations

Manual and staff-authenticated QR check-ins and checkouts create AuditLog entries. QR refresh itself is not audited to avoid unbounded noise. Serializable transactions, stable lock ordering and database uniqueness protect duplicate check-ins, checkouts and membership races.

Attendance correction and auto-checkout are intentionally omitted because their policy is ambiguous; open sessions require operational checkout. There is no member app, public kiosk, biometric/RFID integration, staff attendance, payment, dues, invoice, reminder or deep analytics implementation in this phase. GymOS Phase 5 may consume attendance history but must not rewrite it.
