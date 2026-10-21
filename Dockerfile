# syntax=docker/dockerfile:1
# check=skip=SecretsUsedInArgOrEnv

# One image for every Railway service (docs/engineering/ENVIRONMENTS.md, ADR-011):
#   web       node web/apps/web/server.js                      (default command)
#   release   node ops/packages/database/src/scripts/release.ts  (web's pre-deploy command)
#   cron      node ops/apps/cron/src/main.ts
# Railway builds it from the repo root; build locally with `docker build -t fivvi .`.

# Node 26 as in .nvmrc, pinned by digest. Bump the tag and digest together.
ARG NODE_IMAGE=node:26.10.0-trixie-slim@sha256:ec7758ee051e457b468b32bde57b0879010b325bb9862718e9615225ce4aaae1

FROM ${NODE_IMAGE} AS base
ENV CI=1 \
    NEXT_TELEMETRY_DISABLED=1 \
    TURBO_TELEMETRY_DISABLED=1
# The slim image has no CA certificates; the web build's sentry-cli (OpenSSL) needs them to
# upload the source maps (OBSERVABILITY.md, source maps). Before COPY, so the layer stays cached.
RUN apt-get update \
    && apt-get install --yes --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*
# Node 25+ ships without Corepack. Keep in sync with "packageManager" in package.json.
RUN npm install --global pnpm@12.5.1 && npm cache clean --force
WORKDIR /repo
COPY . .

# The Next.js app as a standalone Node server (output: 'standalone'); the build script
# copies the client assets into it.
FROM base AS web
RUN pnpm install --frozen-lockfile
# Build-time variables from Railway (ENVIRONMENTS.md §7, OBSERVABILITY.md §1): the browser's
# error reporting settings are inlined into the bundle, and the token uploads the source maps
# to Sentry before the build deletes them. Empty locally and in CI. The token only exists in
# this stage: the runtime image copies the build output, never this stage's environment
# (hence the SecretsUsedInArgOrEnv skip at the top; Railway passes variables as build args).
ARG NEXT_PUBLIC_SENTRY_DSN \
    RAILWAY_ENVIRONMENT_NAME \
    RAILWAY_GIT_COMMIT_SHA \
    SENTRY_AUTH_TOKEN
RUN pnpm --filter @fivvi/web build

# Production dependencies of the release step and the cron job, in the monorepo layout, so
# Node runs their TypeScript sources directly (type stripping, as in local development).
FROM base AS ops
RUN pnpm install --frozen-lockfile --prod --filter @fivvi/cron...

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000
WORKDIR /app
COPY --from=web /repo/apps/web/.next/standalone ./web/
COPY --from=ops /repo/node_modules ./ops/node_modules/
COPY --from=ops /repo/packages/database ./ops/packages/database/
COPY --from=ops /repo/packages/observability ./ops/packages/observability/
COPY --from=ops /repo/apps/cron ./ops/apps/cron/
USER node
EXPOSE 3000
CMD ["node", "web/apps/web/server.js"]
