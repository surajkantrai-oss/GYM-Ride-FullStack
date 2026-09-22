# GYMRide Partner Panel

Workspace for gym owners and managers to maintain gym profiles, branches, amenities, operating hours, and approval submissions.

Phase 4 adds relational plan management, exact paise pricing, per-branch slot settings, real rolling availability previews, availability exceptions at the API layer, and authorized booking lists/details. Plan pages are nested under each gym; slot settings are nested under each branch; portfolio bookings are available at `/bookings`.

Copy `.env.example` to `.env.local`, start the backend, then run `pnpm --filter @gymride/partner-panel dev`. The app runs on port 3002.

Access tokens are memory-only and rotated refresh tokens use `sessionStorage`. A reload in the same tab restores the session; closing it signs the user out. This limits persistence compared with `localStorage`, though any browser storage remains exposed to successful XSS. A future web BFF can use secure, HTTP-only cookies without changing the backend’s mobile token flow.
