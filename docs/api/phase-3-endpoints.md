# Phase 3 web support endpoints

Phase 3 reuses the Phase 2 authentication, profile, gym, branch, amenity, operating-hours, and review endpoints. It adds two small read models so dashboards do not download entire collections.

## Admin

- `GET /api/v1/admin/gyms/summary` returns `totalGyms` and zero-filled counts by gym status. Requires `ADMIN` or `SUPER_ADMIN`.
- `GET /api/v1/admin/gyms/:gymId/audit` returns newest-first review audit records with safe actor identity fields. Requires `ADMIN` or `SUPER_ADMIN`.

The existing `GET /api/v1/admin/gyms` remains paginated and accepts `page`, `limit`, `search`, `status`, `city`, and amenity filters.

## Partner

- `GET /api/v1/partner/gyms/summary` returns status counts and total branches within the caller's authorized gym scope.
- `GET /api/v1/partner/gyms` is now paginated and accepts `page`, `limit`, `search`, and `status`. It returns `{ data, meta }` using the same pagination contract as admin lists.

All routes retain backend RBAC and resource-level authorization. The web applications do not rely on client-side role checks as a security boundary.
