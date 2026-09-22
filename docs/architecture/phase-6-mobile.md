# Phase 6 — Customer mobile app

Status: Phase 6 implementation complete and development/sandbox ready. This is not an App Store, Play Store, production, or live-payment readiness declaration. Phases 7+ remain out of scope.

## Architecture

`mobile-app/` was a placeholder, and now contains an Expo 57 / React Native 0.86.3 / React 19.2.3 TypeScript app. Existing web dependencies were preserved. React Navigation provides Home, Explore, Bookings and Profile tabs with Gym, Plan, Slots, Review, Payment and Booking stack routes. TanStack Query is the sole server-state layer; context holds session identity. Feature screens use `src/api/customer.ts`, shared `@gymride/types`, reusable accessible UI and centralized money/time/error helpers.

The native async secure-storage API client is separate from the web synchronous sessionStorage client. It handles request IDs, 15-second timeouts, sanitized errors, single-flight refresh and one replay. A generation guard rejects late responses after logout, and secure-storage writes are serialized.

## Authentication and security

Existing OTP request/verify, refresh, logout and `/users/me` APIs are used. Phone input uses E.164; OTP is six digits and never persisted or logged. Development OTP display requires explicit development configuration and a development backend response. Access tokens remain in memory; refresh tokens use Expo SecureStore Keychain/Keystore with `WHEN_UNLOCKED_THIS_DEVICE_ONLY` on iOS. Startup waits for restoration and profile lookup before showing navigation. Refresh failure clears customer identity and query cache. Logout clears local credentials even when the server request fails; an OS secure-storage failure cannot guarantee physical deletion, but the current process remains signed out.

Only CUSTOMER accounts enter the app. Server authorization is unchanged. No payment secrets, administrative finance, persistent query cache, trusted payment deep-link, or customer-controlled success flag is included. Configuration requires HTTPS except explicit local development. Offline status is visible; mutations are never queued or automatically retried. Cached data can remain visible but may be stale.

## Discovery and booking

Foreground location is opt-in and one-shot with permission/service/unavailable handling and a 15-second position timeout. No background tracking. City/text/state/amenity search remains available without GPS; nearby uses radius/amenities supported by that endpoint. Lists use FlatList pagination and real backend data, without fabricated ratings or pricing.

Gym detail requires explicit branch selection. The branch determines plans, slot availability and timezone. ACTIVE DAY_PASS plans select a server-generated slot; membership plans follow existing no-slot backend semantics. Review submits identifiers only with a UUID Idempotency-Key stable for retries of that mounted selection. Changed identifiers get another key. Keys are not persisted across app termination: after an ambiguous failure, retry the same review or inspect My Bookings. Backend uniqueness remains authoritative.

Money is formatted centrally from integer minor units. Branch IANA timezone formats server timestamps. Reservation countdown is display-only and refreshes at deadline; it never locally changes booking status.

## Payments and refunds

Existing payment-order API returns public checkout fields. Official Razorpay 3.0.0 native checkout returns proof to backend verification. SDK success alone does not confirm a booking. Polling runs every three seconds for at most one minute, then manual refresh remains available. Only backend `CONFIRMED` displays success.

Development provider uses the existing administrator-only capture simulation: the mobile UI explains that no money is charged and requests Admin Finance simulation followed by refresh. No fake customer bypass or real payment is used. Razorpay credentials are still required for separate test-mode provider validation.

Pending reservation cancellation has confirmation UI and follows existing server eligibility. Confirmed cancellation is not exposed because the API does not support it. Customer-safe payment/refund status is displayed without internal ledger, earnings or commission.

## Backend and shared changes

The existing booking select adds branch timezone and a whitelisted payment summary: id/status/amount/currency/refundedAmount and refunds with id/amount/status/createdAt. Ownership and role checks are unchanged. A regression test protects this whitelist. Shared Booking gains optional compatible fields and types for existing public discovery/payment-order contracts. No database models or migrations were changed.

## Development setup

Use Node 22.13+ and the root pnpm version; this host uses Node 25.9 through `/opt/homebrew/bin`. Run `pnpm install --frozen-lockfile`. Start the existing backend, PostgreSQL/PostGIS and Redis; Docker is not required. Backend routes use `/api/v1`; Swagger is `/api/docs`.

Create ignored `mobile-app/.env` from `.env.example` and restart Metro after changes:

| Target | Development API URL example |
| --- | --- |
| Android emulator | `http://10.0.2.2:3000/api/v1` |
| iOS simulator | `http://localhost:3000/api/v1` |
| Physical device | `http://<reachable-host-LAN-IP>:3000/api/v1` |
| Staging/production | Your HTTPS backend URL ending in `/api/v1` |

Set `EXPO_PUBLIC_APP_ENV=development` only locally. All `EXPO_PUBLIC_*` values are public build configuration, never secrets. The current ignored environment targets the iOS simulator (`localhost`). Switch back to `10.0.2.2` for the Android emulator. Physical devices need LAN/firewall access.

Android requires SDK/build tools 36, NDK 27.1, JDK17 and an emulator/device. Run `pnpm --filter @gymride/mobile-app android`. iOS requires compatible Xcode and CocoaPods; run `pnpm --filter @gymride/mobile-app ios`. Native folders are generated by Expo prebuild and ignored; `app.config.ts` is authoritative. Regenerate after native config/plugin changes. Native Razorpay requires a native/development build, not Expo Go for payment validation.

Expo SDK57 documents Xcode26.4+; this host has26.3. iOS native completion must be reported separately from successful JS export or pod installation.

## Local acceptance fixture

The local database originally had no published gyms. `mobile-app/scripts/development-fixture.mjs` creates a clearly labelled local development gym using existing owner/admin APIs. It requires localhost, explicit `CREATE_MOBILE_DEV_FIXTURE=true`, `MOBILE_TEST_API_URL`, `MOBILE_TEST_OWNER_PHONE`, `MOBILE_TEST_ADMIN_PHONE` and development OTP responses. It refuses duplicates, never runs at app startup, keeps tokens in memory and revokes its sessions afterward. Fixture name: GYMRide Mobile Development Gym; Bengaluru, Development Central branch, development day pass. No live commercial offering or money movement.

## Validation

Run mobile `lint`, `typecheck`, `test`, `bundle` through `pnpm --filter @gymride/mobile-app`; root `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`; and `pnpm --filter @gymride/backend test:finance:runtime` for the dedicated local PostgreSQL test database.

Vitest tests cover auth transport, single-flight refresh, validation, money/time, customer contracts, checkout boundary and screen states with mocked native primitives. They do not replace native acceptance. Baseline Phases1–5 tests remain intact.

Acceptance checklist: launch, OTP login, session restoration, Home, nearby permission and denial fallback, gym/branch/plan/date/slot, review, reservation/expiry UI, development order, Admin-simulated capture, authoritative confirmation, bookings/detail, profile edit, cancellation/refund display, logout and offline/error states. Final results and remaining limitations must be recorded before completion.

### Final validation — 2026-09-16

- Android `assembleDebug`: passed twice (final cached build: 351 tasks); APK installed on a Pixel 9 emulator. Native validation covered startup, OTP login, session restoration after process restart, Home, location permission/fallback, Gym Details, explicit branch selection, plan/date/slot, branch-timezone rendering, booking review, `PAYMENT_PENDING` countdown, development order, authoritative confirmation after Admin-only simulation, My Bookings, confirmed detail, partial-refund status, profile edit and logout. Initial emulator snapshot stalled; cold boot with host graphics recovered it without wiping data.
- Android and iOS Hermes/JS export: passed. This is not an iOS native build.
- iOS prebuild and CocoaPods install: passed (94 dependencies and 95 pods). Expo Go runtime on an iPhone 17 Pro Max simulator: passed, with the login screen rendered against the healthy local backend. This is a JS/native-module development preview and does not validate Razorpay. The standalone native compile remains pending: Xcode 26.3 fails strict Swift concurrency checks in Expo Modules JSI, while Expo SDK 57 requires Xcode 26.4+.
- Mobile Vitest: 52 passing; mobile lint and typecheck passed. Android and iOS Hermes exports passed.
- Ordinary workspace: 199 passing total: 52 mobile plus 147 non-mobile (117 backend), including one added safe-booking-select regression; original 146 preserved. Dedicated PostgreSQL finance runtime: all 19 passing. Combined validated count: 218.
- Root lint/typecheck and backend/Admin/Partner builds passed. `pnpm install --frozen-lockfile` refreshed stale links; `pnpm peers check` reports no issues. Expo's locally bundled dependency check reports dependencies current, with the explicit caveat that its network-backed version endpoint was unavailable.
- Real API acceptance used `mobile-app/scripts/acceptance.ts` with explicit localhost/development opt-in. It exercised OTP, profile, gym/nearby/branch/plans/slots, reservation idempotency, server price, order reuse, invalid proof rejection, admin-only simulated capture, confirmed booking/payment, safe summary, bookings, cancellation, profile edit and refresh restoration. Test credentials were not logged/persisted by the script. Booking `d228a8a2-0b47-4689-b734-84d2fe453819` and Android booking `b516896c-a815-47d9-8757-06b42520bd19` remain auditable simulated test records. A ₹100.00 simulated partial refund on the former was displayed as `PARTIALLY REFUNDED` while preserving `CONFIRMED` booking semantics.
- Payment mode actually tested: development provider only. No live or Razorpay test credential was supplied, no Razorpay checkout transaction was performed, and no external money moved.
- Remaining native limitation: the iOS app is running in Expo Go, but standalone native compile/simulator execution is pending because the host has Xcode 26.3 while Expo SDK 57 requires Xcode 26.4+. CocoaPods installation, iOS prebuild and iOS Hermes export passed. A reproducible `expo-modules-jsi` patch applies Expo's upstream constructor-annotation fix, but Xcode 26.3 then reports additional strict-concurrency errors in the same module. Upgrade Xcode before claiming native Razorpay, standalone iOS runtime or store readiness.

## Official references

- [Expo version compatibility](https://docs.expo.dev/versions/latest/)
- [SecureStore](https://docs.expo.dev/versions/latest/sdk/securestore/)
- [Razorpay React Native integration](https://razorpay.com/docs/payments/payment-gateway/react-native-integration/standard/integration-steps-android/)

No check-in, reviews, notifications, hybrid mode, recommendations, AI, deployment or store release is included.
