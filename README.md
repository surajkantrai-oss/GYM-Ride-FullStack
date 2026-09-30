# GYMRide

GYMRide is a full-stack gym-access marketplace for customers who need day passes, term plans, or prepaid multi-city Flex access across participating gyms. The repository implements GYMRide Phases 1–10 and GymOS Phases 1–6: paid gym-scoped SaaS subscriptions, direct members, membership lifecycle, attendance, private member payments/dues, deterministic analytics, and controlled reminders.

This is a development/sandbox implementation. It does not claim live payment or payout processing, physical-device push acceptance, cloud deployment, or app-store release.

## Applications and packages

```text
backend/                 NestJS REST API, Prisma schema, jobs, Swagger and tests
frontend/admin-panel/    Next.js Admin Portal (platform operations and moderation)
frontend/partner-panel/  Next.js Partner Portal (gyms, bookings, finance and reviews)
mobile-app/              Expo/React Native customer application
packages/api-client/     Shared typed HTTP client
packages/types/          Shared TypeScript contracts
packages/validation/     Shared validation helpers
packages/web-ui/         Shared web UI primitives
docs/                    Architecture, API and test documentation
infrastructure/          Local/deployment infrastructure retained from earlier phases
```

The mobile project uses Expo prebuild. Generated `mobile-app/android` and `mobile-app/ios` directories are intentionally ignored and recreated from `app.config.ts` when native validation is needed.

## Architecture and stack

- Node.js 22 (see `.nvmrc`) and pnpm workspaces
- NestJS 11, Prisma 6, PostgreSQL/PostGIS, Redis and BullMQ
- Next.js 16 Admin and Partner portals
- Expo 57, React Native 0.86 and React Navigation
- JWT/refresh-session authentication, OTP development provider and role/resource authorization
- Razorpay-compatible payment abstraction with development payment/payout providers
- Append-only finance ledger, refunds, earnings, settlements and reconciliation
- Server-authoritative QR/OTP check-in lifecycle
- Booking-derived customer reviews, public aggregates and audited Admin moderation
- Persistent in-app notifications, per-device delivery records, provider abstraction and bounded retries
- Prepaid multi-city Flex subscriptions, transactional usage reservation, check-in consumption and gym reimbursement
- Deterministic 0–100 gym recommendations using PostGIS, published ratings, amenities, plans, availability, history and Flex eligibility
- GymOS Phase 1 gym-scoped SaaS plans, fixed-period subscriptions, trials, commercial snapshots and backend feature entitlements
- GymOS Phase 2 direct members, plan limits, lifecycle actions, CSV import, Partner management and Admin read-only oversight
- GymOS Phase 3 gym-scoped membership plans, immutable member snapshots, scheduled activation, expiry, freeze/resume, cancellation, renewal, expiry dashboards and audited lifecycle history
- GymOS Phase 4 direct-member manual/rotating-QR attendance, membership and branch eligibility, current presence, local-time summaries, audit and read-only Admin oversight
- GymOS Phase 5 immutable membership charges, partial member payments, derived dues, receipts, reversals, reconciliation and read-only Admin oversight
- GymOS Phase 6 timezone-safe ranged membership/attendance/finance/renewal analytics, server-segment reminder campaigns, shared quiet hours, persistent delivery history, and bounded BullMQ processing
- Jest/Vitest, ESLint, strict TypeScript and Swagger/OpenAPI

Start with the [system overview](docs/architecture/system-overview.md). Phase-specific references include [finance](docs/architecture/phase-5-finance.md), [reviews and notifications](docs/architecture/phase-8-reviews-notifications.md), [Flex](docs/architecture/phase-9-flex-hybrid.md), [recommendations](docs/architecture/phase-10-recommendations.md), [GymOS Phase 1](docs/architecture/gym-os-phase-1-saas-foundation.md), [GymOS Phase 2](docs/architecture/gym-os-phase-2-members.md), [GymOS Phase 3](docs/architecture/gym-os-phase-3-membership-lifecycle.md), [GymOS Phase 4 attendance](docs/architecture/gym-os-phase-4-attendance.md), [GymOS Phase 5 member finance](docs/architecture/gym-os-phase-5-member-finance.md), and [GymOS Phase 6 analytics/reminders](docs/architecture/gym-os-phase-6-analytics-reminders.md). The presentation layer is documented in the [GYMRide design system](docs/design/GYMRIDE_DESIGN_SYSTEM.md).

## Implemented phases

1. Foundation
2. Authentication, authorization, gym management and discovery
3. Admin and Partner portals
4. Plans, slots, capacity and booking engine
5. Payments, refunds, earnings, ledger and settlements
6. Customer React Native mobile app
7. Secure QR/OTP check-in
8. Reviews and notifications
9. GYMRide Flex / Hybrid Mode
10. Deterministic recommendation engine

GymOS Phases 1–6 provide the SaaS foundation, direct member directory, membership lifecycle, attendance, direct-member payments/dues, deterministic analytics, and controlled reminders. CRM, AI advice, and live messaging providers are not implemented.

Validation counts are recorded after each fresh phase run; use the commands below for the current machine. Customer mobile remains unchanged by GymOS Phase 6.

The Admin and Partner portals use a shared contemporary SaaS shell, while the customer mobile app uses a warmer lifestyle-focused visual system. The redesign preserves all Phase 1–10 routes, API calls, validation, permissions, and business behavior.

## Prerequisites

- Node.js `22.23.2` (recommended through `.nvmrc`; the declared minimum is 20.19)
- pnpm `11.19.0`
- PostgreSQL with PostGIS
- Redis when queue-backed booking, check-in, or notification workers are enabled
- Android Studio/JDK 17 for Android native builds
- A compatible Xcode/CocoaPods toolchain for iOS native builds

PostgreSQL and Redis may be native services or the preserved Compose configuration; Docker is not required by the application code.

## Environment setup

```bash
cp .env.example .env
cp frontend/admin-panel/.env.example frontend/admin-panel/.env.local
cp frontend/partner-panel/.env.example frontend/partner-panel/.env.local
cp mobile-app/.env.example mobile-app/.env
```

Populate `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `OTP_HASH_SECRET`, and `CHECK_IN_TOKEN_SECRET` with independent local secrets of at least 32 characters. Keep real credentials outside Git. The default providers are development-only:

```text
PAYMENT_PROVIDER=development
PUSH_PROVIDER=development
NOTIFICATION_QUEUE_ENABLED=false
GYMOS_REMINDER_QUEUE_ENABLED=false
```

Razorpay requires its key ID, key secret, and webhook secret. Expo push requires an EAS project ID, native push credentials, `PUSH_PROVIDER=expo`, and physical-device acceptance. No `EXPO_PUBLIC_*` value should contain a secret.

Mobile API addresses differ by runtime:

- iOS simulator: `http://localhost:3000/api/v1`
- Android emulator: `http://10.0.2.2:3000/api/v1`, or use `adb reverse tcp:3000 tcp:3000` with localhost
- Physical device: the development machine's reachable LAN address

## Install and initialize

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm prisma:generate
pnpm --filter @gymride/backend prisma:deploy
pnpm db:seed
```

Use `prisma migrate deploy` for committed migrations. `pnpm db:migrate -- --name <name>` is only for creating a new development migration.

## Run locally

```bash
pnpm dev
pnpm --filter @gymride/mobile-app start
```

Individual services:

```bash
pnpm dev:backend
pnpm dev:admin
pnpm dev:partner
pnpm --filter @gymride/mobile-app android
pnpm --filter @gymride/mobile-app ios
```

Local endpoints:

| Service | URL |
| --- | --- |
| API | `http://localhost:3000/api/v1` |
| Swagger | `http://localhost:3000/api/docs` |
| Health | `http://localhost:3000/api/v1/health` |
| Admin Portal | `http://localhost:3001` |
| Partner Portal | `http://localhost:3002` |

Development OTP responses include `developmentOtp` only when `NODE_ENV=development`. Optional `DEV_SEED_OWNER_PHONE` and `DEV_SEED_ADMIN_PHONE` values create controlled local Partner/Admin identities during seeding. Public OTP registration creates Customer users only.

## Validation commands

```bash
pnpm lint
pnpm --filter @gymride/mobile-app lint
pnpm typecheck
pnpm test
pnpm build
pnpm --filter @gymride/mobile-app bundle
pnpm --filter @gymride/backend test:finance:runtime
```

The PostgreSQL runtime runner requires its guarded local test database and refuses any database name other than `gymride_finance_test`. Native builds use Expo prebuild and the platform toolchains:

```bash
pnpm --filter @gymride/mobile-app exec expo prebuild --platform android
pnpm --filter @gymride/mobile-app android
pnpm --filter @gymride/mobile-app exec expo prebuild --platform ios
pnpm --filter @gymride/mobile-app ios
```

## Phase 9 behavior

GYMRide Flex is a prepaid, fixed-period entitlement for one primary and one optional secondary canonical city. Payment activation is backend verified. A Flex booking requires a participating branch and timed slot; allowance is reserved transactionally, released on cancellation, consumed at verified check-in, and forfeited on no-show. The customer pays no incremental booking charge while the backend snapshots a platform-controlled reimbursement that flows through the existing earnings, immutable ledger, and settlement system.

Customer mobile, Partner, and Admin surfaces use real Flex APIs. Partners control branch participation but cannot set reimbursement. Admins manage canonical cities, platform plans, reimbursement rules, subscriptions, and usage. See the Phase 9 architecture document for lifecycle, concurrency, security, and API details.

## Phase 10 behavior

Authenticated recommendations apply hard eligibility and filter rules before deterministic 0–100 scoring. Signals include PostGIS distance, published-review confidence, amenities, active plan price, capacity-backed slot availability, branch-local operating hours, completed-visit affinity, recent popularity, and active Flex eligibility. Home and Explore use the real API; ordinary discovery remains available. Optional, non-sensitive gym preferences can be edited in mobile.

## Phase 8 behavior

Only an owned `COMPLETED` booking can be reviewed. The API derives customer, gym and branch from the booking, enforces one review per booking in PostgreSQL, exposes only published reviews publicly, computes published aggregates in the database, scopes Partner reads, and audits Admin moderation.

Notification intent is persisted independently of external push delivery. Unique dedupe keys prevent duplicate logical messages; device-delivery uniqueness prevents duplicate fan-out; bounded workers handle retries and invalid tokens. Transactional in-app messages cannot be disabled. Mobile notification taps use a controlled internal route map and wait for session restoration before navigation.

## Known limitations

- Development payment and payout providers do not transfer money; Razorpay external acceptance still requires credentials.
- Expo provider adapter tests and local simulation are not physical-device push acceptance. Provider receipt polling is not implemented.
- Android and iOS debug builds, simulator/emulator launch, authenticated session restoration, review rendering, and in-app notification/deep-link flows were validated locally on September 23, 2026. Physical-device acceptance remains separate.
- Android/iOS production signing, Play Store/App Store release, Azure deployment and production hardening are not complete.
- Existing earlier-phase limitations remain documented in their architecture files, including confirmed-booking cancellation and slotless membership check-in constraints.
- Flex recurring billing, proration/refunds, pause, automatic renewal, and slotless Flex access are intentionally not implemented; the initial Flex product requires timed slots.
- Recommendation performance was validated on a representative local fixture, not production-scale traffic. Phase 10 intentionally has no AI, embeddings, natural-language search, sponsored ranking, or long-lived personalized cache.

Do not begin Phase 11 or later work without an explicit phase request.
