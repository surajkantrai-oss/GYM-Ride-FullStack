# GYMRide

GYMRide is a flexible gym-access marketplace for hybrid workers, travellers, and people who want daily or term-based access without buying disconnected memberships in every city: **the fitness membership that moves with you**.

Phase 4 adds relational gym plans, finite timezone-aware slot inventory, capacity-safe temporary reservations, booking history, and Partner/Admin booking operations. The engine intentionally stops at `PAYMENT_PENDING`; payments and the mobile app remain later work.

## Repository structure

```text
backend/                 NestJS API and Prisma schema
frontend/admin-panel/    Next.js administration and approval console
frontend/partner-panel/  Next.js gym-partner workspace
mobile-app/              Phase 6 placeholder
packages/                Shared API client, types, validation, and web UI
infrastructure/          Docker and future Azure/CI-CD areas
docs/                    Architecture, domain, and API decisions
```

The application areas remain separate at the repository root. See [system architecture](docs/architecture/system-overview.md), [domain model](docs/database/domain-model.md), [API guidelines](docs/api/api-guidelines.md), and the [web/mobile user flows and UAT test suite](docs/testing/user-flows-and-uat-test-cases.md).

## Stack

Node.js 20+, pnpm, NestJS, Next.js, React, TanStack Query, React Hook Form, Zod, strict TypeScript, Prisma, PostgreSQL 16 + PostGIS, Redis, Swagger, Vitest/Jest, ESLint, and Prettier.

## Prerequisites

- Node.js 20.19 or newer
- pnpm 11
- Docker Desktop or another Docker Compose-compatible runtime

## Setup

```bash
cp .env.example .env
# Set three independent secrets of at least 32 characters:
# JWT_ACCESS_SECRET, JWT_REFRESH_SECRET, OTP_HASH_SECRET
pnpm install
docker compose up -d
pnpm prisma:generate
pnpm db:migrate
pnpm db:seed
pnpm dev
```

The API listens on `http://localhost:3000`, Admin on `http://localhost:3001`, and Partner on `http://localhost:3002`. Swagger is at `http://localhost:3000/api/docs`; health is at `http://localhost:3000/api/v1/health`. Copy each panel's `.env.example` to `.env.local` before starting it. Individual commands are `pnpm dev:backend`, `pnpm dev:admin`, and `pnpm dev:partner`.

For local OTP testing, `NODE_ENV=development` returns `developmentOtp` from the request endpoint. Staging and production fail closed until a real SMS-backed `OtpProvider` is configured. Optional `DEV_SEED_OWNER_PHONE` and `DEV_SEED_ADMIN_PHONE` values create controlled E.164 development accounts during seeding; public OTP login creates only `CUSTOMER` users.

Docker Compose uses safe local defaults from `.env.example`; change them for any shared environment. `DATABASE_URL` is mandatory. `REDIS_PASSWORD` may be empty for the isolated local container. JWT variables are reserved for Phase 2 and must be populated with real secrets only when authentication is implemented.

## Database commands

```bash
pnpm prisma:generate
pnpm db:migrate -- --name descriptive_migration_name
pnpm db:seed
pnpm --filter @gymride/backend prisma:deploy
```

Migrations are committed. Production uses `prisma migrate deploy`, never `migrate dev` or manual schema edits. The idempotent seed upserts six roles and thirteen amenities.

## Quality commands

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
```

## Phase roadmap

See [authentication](docs/architecture/authentication.md), [web applications](docs/architecture/web-applications.md), [booking engine](docs/architecture/booking-engine.md), [gym lifecycle](docs/architecture/gym-lifecycle.md), [resource authorization](docs/architecture/resource-authorization.md), and the [Phase 4 endpoint catalog](docs/api/phase-4-endpoints.md).

## Phase roadmap

- Phase 1 ✅ Foundation
- Phase 2 ✅ Authentication, RBAC, and gym APIs
- Phase 3 ✅ Admin and Partner web applications
- Phase 4 ✅ Plans, slots, capacity, and booking engine
- Phase 5 — Payments, refunds, earnings, wallets, and settlements

Later phases add the React Native app; QR check-in, reviews, and notifications; Flex and dual-city plans; recommendations/AI; Azure/CI-CD; and release hardening. Each phase is implemented and validated separately.
