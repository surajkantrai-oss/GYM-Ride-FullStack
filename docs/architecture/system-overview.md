# GYMRide system overview

GYMRide starts as a modular monolith: one NestJS deployment with cohesive domain modules and one transactional PostgreSQL database. This keeps operations and cross-domain transactions understandable while the product is young. Boundaries are kept explicit so notifications, payments, recommendations, or booking/availability can be extracted only when independent scaling, deployment, or failure isolation justifies it.

```text
React Native customer app ─┐
Next.js admin panel ───────┼─ HTTPS ─> NestJS API ─┬─> PostgreSQL + PostGIS
Next.js partner panel ─────┘                       ├─> Redis
                                                   └─> Object storage (future)
```

The API owns validation, authorization, lifecycle transitions, and all security-sensitive decisions. PostgreSQL is the durable system of record. PostGIS performs indexed geographic searches. Redis is ephemeral infrastructure for caching, OTP, rate limiting, temporary availability, slot locks, and job queues; it is never the sole source of durable booking or financial truth.

Phase 1 implements configuration, persistence, Redis connectivity, health, request IDs, logging, centralized errors, validation, security middleware, and RBAC foundations. Planned modules include users, roles, gyms, branches, amenities, operating hours, slots, plans, subscriptions, bookings, payments, wallets, settlements, check-ins, reviews, favorites, notifications, recommendations, admin, and analytics.

Kafka, Kubernetes, a service mesh, and distributed microservices are deliberately excluded. Observability can later correlate traces with the existing `x-request-id` contract.
