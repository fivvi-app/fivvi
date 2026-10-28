import { spawn } from 'node:child_process';
import { createDatabase } from '@fivvi/database';
import { runMigrations } from '@fivvi/database/migrate';
import { seed } from '@fivvi/database/seed';
import { appRoleUrl, databaseUrl, identifier, onServer } from '@fivvi/testing/database/server';
import { ensureTestRoles } from '@fivvi/testing/database/setup';

// Playwright's web server command (playwright.config.ts): the standalone server, as in production
// (Dockerfile), on a database of its own. Each run starts from an empty database with every
// migration applied, so the hello row is the migrated one (#94). The database is on the local test
// server (TEST_DATABASE_URL, else DATABASE_URL; localhost only) and stays until the next run.
// The server connects as the app role `fivvi_app`, like production (E011); only the migrations
// here and the seed use the test server's own (privileged) user.

const name = process.env.E2E_DATABASE;
if (!name) throw new Error('Set E2E_DATABASE to the name of the e2e database.');

await ensureTestRoles();
await onServer(
  `DROP DATABASE IF EXISTS ${identifier(name)} WITH (FORCE)`,
  `CREATE DATABASE ${identifier(name)}`,
);
const url = databaseUrl(name);
const client = createDatabase({ url, maxConnections: 1 });
try {
  await runMigrations(client.db);
  // The account owner@example.com and the workspace John's Gym it owns (F001 AC15, F002 AC13): the
  // data of a preview, so a spec can sign in as a person who has a workspace.
  await seed(client.db);
} finally {
  await client.close();
}

// The privileged connection (DATABASE_URL, loaded from .env by playwright.config.ts) stays out of
// the server's environment: the web never needs it.
const { DATABASE_URL: _privileged, ...serverEnv } = process.env;
// Sign-in (F001): a synthetic secret, and this server's own address for the links in emails.
// SIGN_UP_ALLOWED_EMAILS comes from playwright.config.ts.
const server = spawn(process.execPath, ['.next/standalone/apps/web/server.js'], {
  stdio: 'inherit',
  env: {
    ...serverEnv,
    APP_DATABASE_URL: appRoleUrl(name),
    BETTER_AUTH_SECRET: 'e2e-secret-that-is-at-least-thirty-two-characters-long',
    BETTER_AUTH_URL: `http://localhost:${process.env.PORT}`,
  },
});
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => server.kill(signal));
}
server.on('exit', (code) => process.exit(code ?? 1));
