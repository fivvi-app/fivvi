import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  typedRoutes: true,
  // A self-contained Node server in .next/standalone for the Docker image (E003, ADR-011).
  output: 'standalone',
  // Trace files from the monorepo root, so workspace packages end up in the standalone output.
  outputFileTracingRoot: fileURLToPath(new URL('../..', import.meta.url)),
  // Workspace packages ship TypeScript source.
  transpilePackages: [
    '@trainer-hub/api',
    '@trainer-hub/database',
    '@trainer-hub/i18n',
    '@trainer-hub/observability',
  ],
};

export default withNextIntl(nextConfig);
