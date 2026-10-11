FROM node:22.23.2-bookworm-slim AS base

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN corepack enable && corepack prepare pnpm@11.19.0 --activate

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

RUN --mount=type=cache,id=gymride-pnpm-store,target=/pnpm/store \
  pnpm install --frozen-lockfile --filter @gymride/admin-panel...

FROM dependencies AS build

ARG NEXT_PUBLIC_API_BASE_URL=http://localhost:3000/api/v1
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL

COPY . .

RUN pnpm --filter @gymride/admin-panel build

FROM node:22.23.2-bookworm-slim AS runtime

ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3001

WORKDIR /app

COPY --from=build /workspace/frontend/admin-panel/.next/standalone ./
COPY --from=build /workspace/frontend/admin-panel/.next/static ./frontend/admin-panel/.next/static
COPY --from=build /workspace/frontend/admin-panel/public ./frontend/admin-panel/public

WORKDIR /app/frontend/admin-panel

EXPOSE 3001

CMD ["node", "server.js"]
