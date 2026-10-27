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
};

// What packages/api/src does today: types and the repository layer by name.
const ALLOWED = [
  "import type { SignedInAccount, TenantScopes } from '@fivvi/database';",
  "import { HELLO_GREETING, listMyWorkspaces, createClient } from '@fivvi/database';",
  "import { type ClientView, findClient } from '@fivvi/database';",
  "export { listClients } from '@fivvi/database';",
  "import { clientsOf } from '@fivvi/other';",
  "import { clients } from './clients.ts';",
  "import { pgx } from 'pgx';",
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

describe('E011 the list of tables and handles stays complete', () => {
  it('names every table that @fivvi/database exports, and nothing else but the handles', async () => {
    const grit = await readFile(pluginPath, 'utf8');
    const list = /pattern table_or_handle\(\) \{\s*r"\(\?:([^)]+)\)"/.exec(grit)?.[1];
    expect(list, 'table_or_handle() in repository-only-imports.grit').toBeDefined();
    const named = (list ?? '').split('|');

    const tables = Object.entries(database)
      .filter(([, value]) => is(value, PgTable))
      .map(([name]) => name);
    // A table the rule does not name could be imported into a route (add it to table_or_handle()).
    expect(
      tables.filter((name) => !named.includes(name)),
      'tables missing from the rule',
    ).toEqual([]);
    expect(tables).not.toHaveLength(0);

    // The rest of the list are the raw handles, which must still exist under that name.
    const clientSource = await readFile(
      path.join(repoRoot, 'packages/database/src/client.ts'),
      'utf8',
    );
    for (const name of named.filter((n) => !tables.includes(n))) {
      expect(clientSource, `${name} in packages/database/src/client.ts`).toMatch(
        new RegExp(`export (?:function|type|interface) ${name}\\b`),
      );
    }
  });
});
