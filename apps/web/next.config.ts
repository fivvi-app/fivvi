import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // Source maps and debug IDs for Sentry. scripts/publish-source-maps.ts uploads the maps and
  // deletes them from the build output, so they are never served (E009).
  productionBrowserSourceMaps: true,
  turbopack: { debugIds: true },
  // The browser's error reporting reads these at build time (instrumentation-client.ts), next
  // to NEXT_PUBLIC_SENTRY_DSN. Railway passes them to the Docker build (Dockerfile).
  env: {
    RAILWAY_ENVIRONMENT_NAME: process.env.RAILWAY_ENVIRONMENT_NAME ?? '',
    RAILWAY_GIT_COMMIT_SHA: process.env.RAILWAY_GIT_COMMIT_SHA ?? '',
  },
  typedRoutes: true,
  // A self-contained Node server in .next/standalone for the Docker image (E003, ADR-011).
  output: 'standalone',
  // Trace files from the monorepo root, so workspace packages end up in the standalone output.
  outputFileTracingRoot: fileURLToPath(new URL('../..', import.meta.url)),
  // Workspace packages ship TypeScript source.
  transpilePackages: [
    '@fivvi/api',
    '@fivvi/auth',
    '@fivvi/contract',
    '@fivvi/database',
    '@fivvi/email',
    '@fivvi/i18n',
    '@fivvi/observability',
    '@fivvi/ui',
  ],
};

export default withNextIntl(nextConfig);
