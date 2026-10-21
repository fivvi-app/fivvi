import { initBrowserErrorReporting } from '@fivvi/observability/browser';

// Reports uncaught browser errors to Sentry when NEXT_PUBLIC_SENTRY_DSN is set (E009,
// docs/engineering/OBSERVABILITY.md). Runs before the app renders. Next.js inlines these
// variables at build time (next.config.ts), so they must be literal `process.env.X` reads.
initBrowserErrorReporting({
  env: {
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
    RAILWAY_ENVIRONMENT_NAME: process.env.RAILWAY_ENVIRONMENT_NAME,
    RAILWAY_GIT_COMMIT_SHA: process.env.RAILWAY_GIT_COMMIT_SHA,
  },
});
