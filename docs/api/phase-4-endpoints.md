# Phase 4 endpoint catalog

All paths use `/api/v1`.

## Plans

- Partner: `POST/GET /partner/gyms/:gymId/plans`, `GET/PATCH /partner/plans/:planId`, and activate/deactivate actions.
- Public: `GET /gyms/:gymId/plans`, `GET /branches/:branchId/plans`.
- Admin read-only: `GET /admin/gyms/:gymId/plans`, `GET /admin/plans/:planId`.

## Slots and exceptions

- Partner: `GET/PUT /partner/branches/:branchId/slot-config`.
- Partner preview: `GET /partner/branches/:branchId/availability?date=YYYY-MM-DD`.
- Public: `GET /branches/:branchId/availability?date=YYYY-MM-DD&planId=...`.
- Partner exceptions: `GET/PUT /partner/branches/:branchId/availability-exceptions`.

## Bookings

- Customer: `POST /bookings` with `Idempotency-Key`, `GET /bookings`, `GET /bookings/:bookingId`, and `POST /bookings/:bookingId/cancel`.
- Partner read-only: `GET /partner/bookings`, `GET /partner/bookings/:bookingId`.
- Admin read-only: `GET /admin/bookings`, `GET /admin/bookings/:bookingId`.

Partner lists support gym, branch, slot date, status, and pagination filters. Admin lists support status, gym, branch, user, created-date range, and pagination.
