import { publishSourceMaps } from '@fivvi/observability/source-maps';

// After `next build`, before the client assets are copied into the standalone server: uploads
// the source maps to Sentry when SENTRY_AUTH_TOKEN is set, then deletes them all (E009).
await publishSourceMaps({ buildDir: '.next' });
