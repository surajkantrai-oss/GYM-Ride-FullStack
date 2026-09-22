# GYMRide Admin Panel

Operations console for administrators to review, approve, reject, suspend, and reactivate gyms.

Phase 4 adds read-only platform booking lists and lifecycle details at `/bookings`, plus plan visibility within gym review pages. The Admin panel cannot fabricate payment success or mutate bookings.

Copy `.env.example` to `.env.local`, start the backend, then run `pnpm --filter @gymride/admin-panel dev`. The app runs on port 3001.

Access tokens live only in memory. The rotated refresh token is held in `sessionStorage`, so a same-tab reload restores the session but closing the tab ends it. This avoids long-lived `localStorage` credentials while retaining direct API compatibility for mobile clients. A future BFF can move web refresh tokens to secure, HTTP-only cookies.
