FROM node:22.23.2-bookworm-slim AS base

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV CI=true

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable \
  && corepack prepare pnpm@11.19.0 --activate

WORKDIR /workspace

FROM base AS dependencies

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY patches ./patches
COPY backend/package.json ./backend/package.json
COPY frontend/admin-panel/package.json ./frontend/admin-panel/package.json
COPY frontend/partner-panel/package.json ./frontend/partner-panel/package.json
COPY mobile-app/package.json ./mobile-app/package.json
COPY packages/api-client/package.json ./packages/api-client/package.json
COPY packages/types/package.json ./packages/types/package.json
COPY packages/validation/package.json ./packages/validation/package.json
COPY packages/web-ui/package.json ./packages/web-ui/package.json

RUN --mount=type=cache,id=gymride-backend-pnpm-store-v2,target=/pnpm/store \
  pnpm install --frozen-lockfile --filter @gymride/backend...

FROM dependencies AS build

COPY . .

RUN pnpm --filter @gymride/backend prisma:generate \
  && pnpm --filter @gymride/backend build

FROM build AS tooling

CMD ["pnpm", "--filter", "@gymride/backend", "prisma:deploy"]

FROM node:22.23.2-bookworm-slim AS runtime

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

COPY --from=build /workspace/node_modules ./node_modules
COPY --from=build /workspace/backend/node_modules ./backend/node_modules
COPY --from=build /workspace/backend/package.json ./backend/package.json
COPY --from=build /workspace/backend/dist ./backend/dist
COPY --from=build /workspace/backend/prisma ./backend/prisma

EXPOSE 3000

CMD ["node", "backend/dist/main.js"]
