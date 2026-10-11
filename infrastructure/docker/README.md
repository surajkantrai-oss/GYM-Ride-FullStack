# Local Docker deployment

The root `docker-compose.yml` runs the complete local development-deployment stack:

- PostgreSQL 16 with PostGIS 3.5 and a named persistent volume
- ephemeral Redis 7.4 on the private Compose network
- one-shot Prisma migration and idempotent system-seed services
- the compiled NestJS backend on port 3000
- standalone Next.js Admin and Partner servers on ports 3001 and 3002

The Expo mobile application is intentionally not containerized. It continues to use the host-accessible backend URL appropriate to its simulator, emulator, or physical device.

## Configure

From the repository root:

```bash
cp .env.docker.example .env.docker
```

Replace the four application secret placeholders with independent random values of at least 32 characters. Keep `.env.docker` untracked. `POSTGRES_PASSWORD` and the password embedded in `DATABASE_URL` must match. The database URL must retain the Compose hostname `postgres`; Redis uses the hostname `redis`.

`NEXT_PUBLIC_API_BASE_URL` is embedded into both browser bundles at build time and therefore uses the host-visible URL `http://localhost:3000/api/v1`, not the Compose-only service name.

## Build and run

```bash
docker compose --env-file .env.docker build --no-cache
docker compose --env-file .env.docker up -d
docker compose --env-file .env.docker ps
docker compose --env-file .env.docker logs -f backend admin partner
```

The startup chain is PostgreSQL/Redis health, `prisma migrate deploy`, the idempotent bootstrap seed, backend health, then both portals.

Local URLs:

- Backend health: <http://localhost:3000/api/v1/health>
- Swagger: <http://localhost:3000/api/docs>
- Admin: <http://localhost:3001>
- Partner: <http://localhost:3002>

## Lifecycle and diagnostics

```bash
docker compose --env-file .env.docker restart
docker compose --env-file .env.docker logs --tail=200
docker compose --env-file .env.docker run --rm seed
docker compose --env-file .env.docker exec postgres psql -U gymride -d gymride -c 'SELECT PostGIS_Full_Version();'
docker compose --env-file .env.docker exec redis redis-cli ping
docker compose --env-file .env.docker down
```

Running `down` preserves `gymride_postgres_data`; do not add `-v` when validating persistence. Redis is deliberately ephemeral because it is queue/cache infrastructure rather than authoritative business storage.
