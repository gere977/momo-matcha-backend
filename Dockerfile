# Explicit multi-stage build, replacing Railway's Railpack auto-detection.
# Railpack's zero-config builder was silently not carrying .medusa/server
# (Medusa's build output - includes the admin dashboard's index.html) from
# its build stage into the runtime container, with no documented way to
# fix it for this non-standard output path. This Dockerfile makes every
# copy explicit so there's nothing left to guess about.

FROM node:22-bookworm-slim AS base
RUN corepack enable && corepack prepare pnpm@11.9.0 --activate
WORKDIR /app

# ---- deps: install first, cached separately from source changes ----
FROM base AS deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ libatomic1 \
    && rm -rf /var/lib/apt/lists/*
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/backend/package.json ./apps/backend/package.json
RUN pnpm install --frozen-lockfile

# ---- build: full source + medusa build (produces .medusa/server) ----
FROM deps AS build
COPY . .
RUN pnpm exec turbo build --filter=@dtc/backend

# ---- runtime: only what's needed to run `medusa start` ----
FROM node:22-bookworm-slim AS runtime
RUN corepack enable && corepack prepare pnpm@11.9.0 --activate
RUN apt-get update && apt-get install -y --no-install-recommends libatomic1 \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app ./

EXPOSE 9000
CMD ["pnpm", "exec", "turbo", "start", "--filter=@dtc/backend"]
