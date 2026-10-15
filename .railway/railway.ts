// Railway Infrastructure as Code for the `trainer-hub` project (E003, ADR-011).
// How to plan and apply it, and what each environment is for: docs/engineering/ENVIRONMENTS.md.
//
// Apply it to `production` and to `development` (the base environment that every PR
// environment is copied from). PR environments are never applied to directly.
import { defineRailway, github, postgres, preserve, project, service } from 'railway/iac';

const REPO = 'thekeyvan/trainer-hub';

/** EU West Metal, Amsterdam. Every service and volume runs here (ADR-011, PRODUCT.md §79). */
const REGION = 'europe-west4-drams3a';

const ENVIRONMENTS = ['production', 'development'] as const;

/** Build inputs of every service. Changes elsewhere (docs, native apps) don't redeploy. */
const ROOT_WATCH_PATTERNS = [
  '/Dockerfile',
  '/.dockerignore',
  '/package.json',
  '/pnpm-lock.yaml',
  '/pnpm-workspace.yaml',
  '/tsconfig.base.json',
];

/** Scripts inside the image; see the header of the Dockerfile. */
const RELEASE = 'node /app/ops/packages/database/src/scripts/release.ts';
const CRON = 'node /app/ops/apps/cron/src/main.ts';

export default defineRailway((ctx) => {
  const environment = ctx.environment ?? '';
  if (!(ENVIRONMENTS as readonly string[]).includes(environment)) {
    throw new Error(
      `Apply this file to ${ENVIRONMENTS.join(' or ')} only, not to "${environment}". ` +
        'PR environments are copies of development.',
    );
  }
  const production = ctx.isEnvironment('production');

  // Deploys `main` after CI passes ("Wait for CI"). PR environments deploy their PR branch.
  const source = github(REPO, { branch: 'main', checkSuites: true });
  const dockerfile = { builder: 'DOCKERFILE', dockerfilePath: 'Dockerfile' } as const;

  // Private network only: no TCP proxy, so Postgres has no public address.
  const db = postgres('postgres', { region: REGION });

  const web = service('web', {
    source,
    build: {
      ...dockerfile,
      watchPatterns: ['/apps/web/**', '/packages/**', ...ROOT_WATCH_PATTERNS],
    },
    regions: { [REGION]: 1 },
    // Migrations run once per deploy, before the new version gets traffic. Previews also
    // (re)seed demo data; production never does (packages/database/README.md).
    preDeploy: production ? RELEASE : `${RELEASE} --seed`,
    healthcheck: '/api/v1/health',
    healthcheckTimeout: 120,
    // Railway's defaults apply: restart on failure (10 retries), never sleep. Railway drops
    // settings equal to a default, so declaring them would show as drift on every plan.
    // Idle previews sleep after 10 minutes and wake on the next request (ADR-011 cond. 1).
    ...(production ? {} : { deploy: { sleepApplication: true } }),
    env: {
      DATABASE_URL: db.env.DATABASE_URL,
      // Railway injects PORT=8080 otherwise. The Railway domain targets 3000 (EXPOSE in the
      // Dockerfile), so pin it: a mismatch passes the health check but answers 502 publicly.
      PORT: '3000',
      // Transactional email (E006, packages/email). Values are set in the dashboard, never
      // here: production gets the real Brevo key, development (and so previews) a test key.
      BREVO_API_KEY: preserve(),
      EMAIL_FROM_ADDRESS: preserve(),
      EMAIL_FROM_NAME: 'Trainer Hub',
      // Product events (E009, packages/observability): the PostHog EU project key, set in the
      // dashboard for production only. Empty (development, previews) sends nothing.
      POSTHOG_KEY: preserve(),
      // Error reporting (E009, packages/observability): the DSN of the Sentry `web` project,
      // set in the dashboard. Empty turns reporting off.
      SENTRY_DSN: preserve(),
    },
  });

  const cron = service('cron', {
    source,
    build: {
      ...dockerfile,
      watchPatterns: [
        '/apps/cron/**',
        '/packages/database/**',
        '/packages/observability/**',
        ...ROOT_WATCH_PATTERNS,
      ],
    },
    regions: { [REGION]: 1 },
    start: CRON,
    deploy: {
      // Daily, in UTC (ADR-010). Railway starts the job and expects it to exit.
      cronSchedule: '0 3 * * *',
      restartPolicyType: 'NEVER',
    },
    env: {
      DATABASE_URL: db.env.DATABASE_URL,
      // The DSN of the Sentry `cron` project (E009), set in the dashboard. Empty turns it off.
      SENTRY_DSN: preserve(),
    },
  });

  return project('trainer-hub', { resources: [db, web, cron] });
});
