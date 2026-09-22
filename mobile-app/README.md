# GYMRide Customer Mobile App

Expo / React Native / TypeScript customer app. Phase 6 only.

Install workspace dependencies, configure `.env` from `.env.example` with your backend `/api/v1` URL, and start the existing backend/PostgreSQL/Redis services.

From the repository root run `pnpm --filter @gymride/mobile-app android` or `pnpm --filter @gymride/mobile-app ios`. Native Razorpay needs a native development build. Native folders are generated and ignored.

Run mobile `lint`, `typecheck`, `test`, and `bundle` scripts. See [architecture, environment setup and validation](../docs/architecture/phase-6-mobile.md). Native acceptance is tracked separately from JS bundle success.
