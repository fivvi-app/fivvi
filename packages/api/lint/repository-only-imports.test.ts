import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { promisify } from 'node:util';
import * as database from '@fivvi/database';
import { is } from 'drizzle-orm';
import { PgTable } from 'drizzle-orm/pg-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// AC17 of spec #145: code in packages/api/src reaches business data through the repositories of
// @fivvi/database, never through a table or a raw database handle. The rule is the Biome plugin
// lint/repository-only-imports.grit, registered for packages/api/src in the root biome.json. This
// runs it on fixtures laid out like the repo, and on the real code.
const packageRoot = path.resolve(import.meta.dirname, '..');
const repoRoot = path.resolve(packageRoot, '../..');
const biome = createRequire(import.meta.url).resolve('@biomejs/biome/bin/biome');
const pluginPath = path.join(packageRoot, 'lint/repository-only-imports.grit');

const SPAWN_TIMEOUT_MS = 60_000;

type Diagnostic = {
  category: string;
  severity: string;
  location: { path: string; start: { line: number } };
};

async function runBiome(cwd: string, target: string): Promise<Diagnostic[]> {
  const output = await promisify(execFile)(
    process.execPath,
    [biome, 'lint', '--reporter=json', target],
    { cwd, env: { ...process.env, NO_COLOR: '1' } },
  ).catch((error: { stdout: string }) => error);
  return JSON.parse(output.stdout).diagnostics;
}

const pluginErrors = (diagnostics: Diagnostic[]) =>
  diagnostics.filter((d) => d.category === 'plugin' && d.severity === 'error');

// What the rule must refuse in packages/api/src: one import per line, so the diagnostics name them.
const FORBIDDEN: Record<string, string> = {
  'a business table': "import { clients } from '@fivvi/database';",
  'a team members table': "import { teamMembers } from '@fivvi/database';",
  'a table among allowed names': "import { createClient, clients } from '@fivvi/database';",
  'a table renamed': "import { clients as c } from '@fivvi/database';",
  'a table as a type': "import type { clients } from '@fivvi/database';",
  'a table with an inline type keyword': "import { type clients } from '@fivvi/database';",
  'a sign-in table': "import { authSessions } from '@fivvi/database';",
  'the organizations table': "import { organizations } from '@fivvi/database';",
  createDatabase: "import { createDatabase } from '@fivvi/database';",
  createDatabaseFromEnv: "import { createDatabaseFromEnv } from '@fivvi/database';",
  'the Database type': "import type { Database } from '@fivvi/database';",
  'the DatabaseClient type': "import { type DatabaseClient } from '@fivvi/database';",
  'the DatabaseExecutor type': "import type { DatabaseExecutor } from '@fivvi/database';",
  'a table re-exported': "export { clients } from '@fivvi/database';",
  'a handle re-exported as a type': "export type { Database } from '@fivvi/database';",
  'a namespace import': "import * as db from '@fivvi/database';",
  'export *': "export * from '@fivvi/database';",
  'export * as': "export * as db from '@fivvi/database';",
  'a dynamic import': "export const load = () => import('@fivvi/database');",
  'a require': "export const db = require('@fivvi/database');",
  'drizzle-orm': "import { sql } from 'drizzle-orm';",
  'a drizzle-orm subpath': "import { pgTable } from 'drizzle-orm/pg-core';",
  'the node-postgres driver': "import pg from 'pg';",
  'the seed entry': "import { seed } from '@fivvi/database/seed';",
  'the migrate entry': "import { runMigrations } from '@fivvi/database/migrate';",
  'the testing entry': "import { addClient } from '@fivvi/database/testing';",
  // The handles and the privileged connection that PR #264 adds to @fivvi/database.
  createAppDatabaseFromEnv: "import { createAppDatabaseFromEnv } from '@fivvi/database';",
  openPrivilegedDatabase: "import { openPrivilegedDatabase } from '@fivvi/database';",
  inspectConnectionRole: "import { inspectConnectionRole } from '@fivvi/database';",
  readDatabaseConfig: "import { readDatabaseConfig } from '@fivvi/database';",
  // A dynamic import or a require gets the same rule as a static import.
  'a dynamic import of pg': "export const load = () => import('pg');",
  'a dynamic import of drizzle-orm': "export const load = () => import('drizzle-orm');",
  'a dynamic import of a drizzle-orm subpath':
    "export const load = () => import('drizzle-orm/node-postgres');",
  'a dynamic import of the seed entry': "export const load = () => import('@fivvi/database/seed');",
  'a dynamic import of the migrate entry':
    "export const load = () => import('@fivvi/database/migrate');",
  'a dynamic import of the testing entry':
    "export const load = () => import('@fivvi/database/testing');",
  'a require of pg': "export const pg = require('pg');",
  'a require of a drizzle-orm subpath': "export const orm = require('drizzle-orm/node-postgres');",
  'a require of the seed entry': "export const seed = require('@fivvi/database/seed');",
  // A path into the source of the database package is the package without its exports.
  'a relative import of a schema file':
    "import { clients } from '../../database/src/schema/tenancy.ts';",
  'a relative import of the index': "import { createClient } from '../../database/src/index.ts';",
  'a relative import of the client':
    "import { createDatabase } from '../../database/src/client.ts';",
  'a relative re-export': "export { clients } from '../../database/src/schema/tenancy.ts';",
  'a relative dynamic import': "export const load = () => import('../../database/src/index.ts');",
  'a relative require': "export const db = require('../../database/src/index.ts');",
  'a package path into the source':
    "import { clients } from '@fivvi/database/src/schema/tenancy.ts';",
  // Test helpers (the database server, factories) are for tests.
  'the testing package': "import { createTemplateDatabase } from '@fivvi/testing/database';",
  'a testing subpath': "import { startDatabaseServer } from '@fivvi/testing/database/server';",
  'a dynamic import of the testing package':
    "export const load = () => import('@fivvi/testing/clock');",
};

// What packages/api/src does today: types and the repository layer by name.
const ALLOWED = [
  "import type { SignedInAccount, TenantScopes } from '@fivvi/database';",
  "import { HELLO_GREETING, listMyWorkspaces, createClient } from '@fivvi/database';",
  // What the packages/api/src of PR #264 imports from the package (startup.ts, access.ts,
  // dependencies.ts, routes/hello.ts): a variable name and a type, neither opens a connection.
  "import { APP_DATABASE_URL_VARIABLE, type ConnectionRoleReport } from '@fivvi/database';",
  "import type { SignedInAccount, SystemGreetingView } from '@fivvi/database';",
  "import { HELLO_GREETING } from '@fivvi/database';",
  "import { type ClientView, findClient } from '@fivvi/database';",
  "export { listClients } from '@fivvi/database';",
  "import { clientsOf } from '@fivvi/other';",
  "import { clients } from './clients.ts';",
  "import { pgx } from 'pgx';",
  "import { sibling } from './database-src.ts';",
  "import { rows } from '../database/source.ts';",
  "export const load = () => import('./clients.ts');",
  "import { testing } from '@fivvi/testing-tools';",
];

let dir: string;
let diagnostics: Diagnostic[];
let allowedDiagnostics: Diagnostic[];
let realCode: Diagnostic[];
const fixtureFiles = Object.keys(FORBIDDEN).map((name, index) => ({
  name,
  file: `packages/api/src/forbidden-${index}.ts`,
}));

beforeAll(async () => {
  const root = JSON.parse(await readFile(path.join(repoRoot, 'biome.json'), 'utf8'));
  // The override of packages/api/src, with the plugin as an absolute path: the fixtures sit in
  // another folder than the repo's biome.json.
  const override = root.overrides.find(
    (o: { includes: string[] }) => o.includes.join() === 'packages/api/src/**',
  );
  expect(override?.plugins).toEqual(['packages/api/lint/repository-only-imports.grit']);
  const config = {
    root: true,
    // The fixtures live in an ignored folder (test-results/), so the repo's own lint skips them.
    vcs: { enabled: false },
    linter: { rules: { preset: 'none' } },
    overrides: [{ includes: override.includes, plugins: [pluginPath] }],
  };
  await mkdir(path.join(packageRoot, 'test-results'), { recursive: true });
  dir = await mkdtemp(path.join(packageRoot, 'test-results', 'repository-imports-'));
  await writeFile(path.join(dir, 'biome.json'), JSON.stringify(config));
  const write = async (file: string, source: string) => {
    await mkdir(path.dirname(path.join(dir, file)), { recursive: true });
    await writeFile(path.join(dir, file), `${source}\n`);
  };
  for (const { name, file } of fixtureFiles) await write(file, FORBIDDEN[name] ?? '');
  await write('packages/api/src/allowed.ts', ALLOWED.join('\n'));
  // The same forbidden imports in a test of the package: tests seed and read rows directly.
  await write('packages/api/test/seeds.ts', Object.values(FORBIDDEN).join('\n'));
  diagnostics = await runBiome(dir, '.');
  allowedDiagnostics = diagnostics.filter((d) => d.location.path.endsWith('allowed.ts'));
  // The real code, with the repo's own configuration.
  realCode = await runBiome(packageRoot, 'src');
}, SPAWN_TIMEOUT_MS);

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('E011 repository-only imports in packages/api/src', () => {
  it.each(fixtureFiles)('fails lint on $name', ({ file }) => {
    const flagged = pluginErrors(diagnostics).filter((d) => d.location.path === file);
    expect(flagged.length).toBeGreaterThanOrEqual(1);
  });

  it('passes the repositories, types and other packages by name', () => {
    expect(allowedDiagnostics).toEqual([]);
  });

  it('leaves the tests of the package free to use tables and handles', () => {
    expect(
      pluginErrors(diagnostics).filter((d) => d.location.path.startsWith('packages/api/test/')),
    ).toEqual([]);
  });

  it('passes on the current code of packages/api/src', () => {
    expect(pluginErrors(realCode)).toEqual([]);
    // The real code was linted with the repo's own configuration: the rule is registered.
    expect(realCode.filter((d) => d.category === 'internalError/io')).toEqual([]);
  });
});

describe('E011 every export of @fivvi/database is forbidden or allowed', () => {
  // What a route may import from @fivvi/database, each with why it cannot reach a table or open a
  // connection. Everything else the package exports must be named in table_or_handle() of the rule.
  const ALLOWED_EXPORTS: Record<string, string> = {
    // Repositories: every query takes a tenant scope or runs on system data.
    createClient: 'repository of clients, takes a workspace scope',
    findClient: 'repository of clients, takes a workspace scope',
    listClients: 'repository of clients, takes a workspace scope',
    listMyWorkspaces: 'repository of places, takes the account scope',
    findSystemGreeting: 'query of the system data, which has no tenant',
    consumeRateLimit:
      'query of the rate limits, which have no tenant; takes the executor it is given',
    deleteExpiredRateLimits: 'query of the rate limits, which have no tenant',
    recordWrongSignInCode: 'query of the sign-in verifications, which have no tenant',
    pingDatabase: 'runs SELECT 1 on the executor it is given; reads no data',
    // PR #264 exports APP_DATABASE_URL_VARIABLE (a variable name) and ConnectionRoleReport (a type),
    // and its packages/api/src/startup.ts imports both; neither opens a connection, so the rule does
    // not forbid them (the ALLOWED fixtures above prove it). Whichever of #258 and #264 lands second
    // adds both names here: adding them before the package exports them fails the "no longer
    // exports" check below.
    // The tenant scope: the one way to the repositories.
    createTenantScopes: 'builds the scopes around an executor it is given; opens no connection',
    // Constants and types.
    HELLO_GREETING: 'a constant of the system data',
    RateLimitRule: 'type',
    SystemGreetingView: 'type',
    ClientView: 'type',
    WorkspacePlace: 'type',
    AccountScopeInput: 'type of the tenant scope',
    ActingAs: 'type of the tenant scope',
    Place: 'type of the tenant scope',
    TeamRole: 'type of the tenant scope',
    TenantContext: 'type of the tenant scope',
    TenantScope: 'type of the tenant scope',
    TenantScopes: 'type of the tenant scope',
    WorkspaceEntry: 'type of the tenant scope',
    WorkspaceScope: 'type of the tenant scope',
    WorkspaceScopeInput: 'type of the tenant scope',
  };

  let forbidden: string[];
  beforeAll(async () => {
    const grit = await readFile(pluginPath, 'utf8');
    const list = /pattern table_or_handle\(\) \{\s*r"\(\?:([^)]+)\)"/.exec(grit)?.[1];
    expect(list, 'table_or_handle() in repository-only-imports.grit').toBeDefined();
    forbidden = (list ?? '').split('|');
  });

  // The names the package exports: its runtime keys, and the type names its index declares (types
  // have no runtime key, and a type of a handle is as good as the handle).
  async function exportedNames(): Promise<{ runtime: string[]; types: string[] }> {
    const index = await readFile(path.join(repoRoot, 'packages/database/src/index.ts'), 'utf8');
    const inline = [...index.matchAll(/\btype (\w+)/g)].map((m) => m[1] ?? '');
    // `export type { A, B } from …` blocks name their types without a `type` keyword before each.
    const blocks = [...index.matchAll(/\bexport type \{([^}]*)\}/g)].flatMap((m) =>
      (m[1] ?? '')
        .split(',')
        .map((item) => (item.split(/\bas\b/).pop() ?? '').trim())
        .filter(Boolean),
    );
    const types = [...inline, ...blocks];
    return { runtime: Object.keys(database), types };
  }

  it('classifies every runtime export and type of the package', async () => {
    const { runtime, types } = await exportedNames();
    expect(runtime).not.toHaveLength(0);
    const unclassified = [...runtime, ...types].filter(
      (name) => !forbidden.includes(name) && !(name in ALLOWED_EXPORTS),
    );
    // A new export is a new way into the data until someone says which it is: name it in
    // table_or_handle() of the rule (a table, a handle, anything that opens a connection or
    // builds a query) or in ALLOWED_EXPORTS above with the reason a route may use it.
    expect(
      unclassified,
      'exports of @fivvi/database that are neither forbidden nor allowed',
    ).toEqual([]);
  });

  it('forbids every table', () => {
    const tables = Object.entries(database)
      .filter(([, value]) => is(value, PgTable))
      .map(([name]) => name);
    expect(tables).not.toHaveLength(0);
    expect(tables.filter((name) => !forbidden.includes(name))).toEqual([]);
  });

  it('keeps the allowed list free of forbidden names and of names the package no longer exports', async () => {
    const { runtime, types } = await exportedNames();
    const exported = [...runtime, ...types];
    expect(Object.keys(ALLOWED_EXPORTS).filter((name) => forbidden.includes(name))).toEqual([]);
    expect(Object.keys(ALLOWED_EXPORTS).filter((name) => !exported.includes(name))).toEqual([]);
  });

  it('still forbids the connection handles, those of PR #264 included, whichever merges first', () => {
    for (const name of [
      'createDatabase',
      'createDatabaseFromEnv',
      'createAppDatabaseFromEnv',
      'openPrivilegedDatabase',
      'inspectConnectionRole',
      'readDatabaseConfig',
      'Database',
      'DatabaseClient',
      'DatabaseExecutor',
    ]) {
      expect(forbidden, name).toContain(name);
    }
  });
});
