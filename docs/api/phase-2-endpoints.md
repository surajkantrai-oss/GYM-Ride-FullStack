# Phase 2 endpoints

All routes are under `/api/v1`. Protected routes use `Authorization: Bearer <access-token>`.

| Method | Path | Authorization | Purpose |
|---|---|---|---|
| POST | `/auth/otp/request` | Public, throttled | Request phone OTP |
| POST | `/auth/otp/verify` | Public, throttled | Verify OTP and create session |
| POST | `/auth/refresh` | Refresh token body | Rotate tokens |
| POST | `/auth/logout` | Authenticated | Revoke current session |
| POST | `/auth/logout-all` | Authenticated | Revoke every session |
| GET/PATCH | `/users/me` | Authenticated | Read/update safe profile fields |
| POST/GET | `/partner/gyms` | Owner/admin; list also manager | Create/list managed gyms |
| GET/PATCH | `/partner/gyms/:gymId` | Resource-authorized | Read/update private gym |
| POST | `/partner/gyms/:gymId/submit` | Owner/admin | Submit complete profile |
| POST/GET | `/partner/gyms/:gymId/branches` | Resource-authorized | Create/list branches |
| GET/PATCH | `/partner/branches/:branchId` | Resource-authorized | Read/update branch |
| GET | `/amenities` | Public | List platform amenities |
| PUT | `/partner/branches/:branchId/amenities` | Resource-authorized | Replace assignments atomically |
| GET/PUT | `/partner/branches/:branchId/operating-hours` | Resource-authorized | Read/replace weekly schedule |
| GET | `/admin/gyms` | Admin | Paginated review queue |
| GET | `/admin/gyms/:gymId` | Admin | Review complete profile |
| POST | `/admin/gyms/:gymId/approve` | Admin | Approve pending gym |
| POST | `/admin/gyms/:gymId/reject` | Admin | Reject with reason |
| POST | `/admin/gyms/:gymId/suspend` | Admin | Suspend with reason |
| POST | `/admin/gyms/:gymId/reactivate` | Admin | Restore approved status |
| GET | `/gyms` | Public | Approved-gym discovery |
| GET | `/gyms/nearby` | Public | PostGIS radius search, 0.1–50 km |
| GET | `/gyms/:gymId` | Public | Approved gym detail |
| GET | `/branches/:branchId` | Public | Active approved branch detail |

Lists use `page` (default 1) and `limit` (default 20, maximum 100). `amenities` is a comma-separated list of seeded amenity slugs. Admin lists support `status`, `city`, and `search`. Public lists support `city`, `state`, `search`, and amenities. Nearby search accepts E.164-independent coordinates, `radiusKm`, pagination, and amenity slugs and is ordered by distance.

Notable errors include `INVALID_OTP`, `OTP_EXPIRED`, `OTP_ATTEMPTS_EXCEEDED`, `OTP_RATE_LIMITED`, `INVALID_REFRESH_TOKEN`, `SESSION_REVOKED`, `INSUFFICIENT_ROLE`, `GYM_NOT_FOUND`, `GYM_PROFILE_INCOMPLETE`, `INVALID_GYM_STATUS_TRANSITION`, `BRANCH_NOT_FOUND`, `AMENITY_NOT_FOUND`, and `OPERATING_HOURS_OVERLAP`.
