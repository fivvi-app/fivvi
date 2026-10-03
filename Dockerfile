# syntax=docker/dockerfile:1

# One image for every Railway service (docs/engineering/ENVIRONMENTS.md, ADR-011):
#   web       node web/apps/web/server.js                      (default command)
#   release   node ops/packages/database/src/scripts/release.ts  (web's pre-deploy command)
#   cron      node ops/apps/cron/src/main.ts
# Railway builds it from the repo root; build locally with `docker build -t trainer-hub .`.

# Node 26 as in .nvmrc, pinned by digest. Bump the tag and digest together.
ARG NODE_IMAGE=node:26.10.0-trixie-slim@sha256:ec7758ee051e457b468b32bde57b0879010b325bb9862718e9615225ce4aaae1

FROM ${NODE_IMAGE} AS base
ENV CI=1 \
    NEXT_TELEMETRY_DISABLED=1 \
    TURBO_TELEMETRY_DISABLED=1
# Node 25+ ships without Corepack. Keep in sync with "packageManager" in package.json.
RUN npm install --global pnpm@12.5.1 && npm cache clean --force
WORKDIR /repo
COPY . .

# The Next.js app as a standalone Node server (output: 'standalone'); the build script
# copies the client assets into it.
FROM base AS web
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @trainer-hub/web build

# Production dependencies of the release step and the cron job, in the monorepo layout, so
# Node runs their TypeScript sources directly (type stripping, as in local development).
FROM base AS ops
RUN pnpm install --frozen-lockfile --prod --filter @trainer-hub/cron...

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000
WORKDIR /app
COPY --from=web /repo/apps/web/.next/standalone ./web/
COPY --from=ops /repo/node_modules ./ops/node_modules/
COPY --from=ops /repo/packages/database ./ops/packages/database/
COPY --from=ops /repo/apps/cron ./ops/apps/cron/
USER node
EXPOSE 3000
CMD ["node", "web/apps/web/server.js"]
