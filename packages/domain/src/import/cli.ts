import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { basename, extname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { createDatabase } from '@fivvi/database';
import { runMigrations } from '@fivvi/database/migrate';
import { localServerUrl } from '@fivvi/testing/database/server';
import pg from 'pg';
import { checkImport, type ImportCheck, type ImportProblem } from './check.ts';
import { ImportFileError, type ParsedImport, parseCsvFiles, parseWorkbook } from './parse.ts';
import { type ImportPlan, planImport } from './plan.ts';
import {
  isWorkspaceFixtureName,
  loadWorkspaceFixture,
  readWorkspaceSnapshot,
  WORKSPACE_FIXTURES,
  type WorkspaceFixtureName,
} from './workspace-fixtures.ts';

// The dry-run of the import (E015, AC15):
//
//   pnpm --filter @fivvi/domain import:dry-run --file <path> --workspace-fixture <name>
//
// It loads the named synthetic workspace into a scratch database on a LOCAL Postgres, runs the same
// check and plan as the API, drops the scratch database and prints counts, and error types with
// sheet and row. It never prints a name, an email address, a column name or a cell value: its
// output is safe to paste into a PR. Point IMPORT_DRY_RUN_DATABASE_URL (else TEST_DATABASE_URL) at
// the Postgres of `pnpm db:up`; any other host is refused. A CSV file is the sheet named by its
// file name (`clients.csv`, `import-sample.clients.csv`), and `--file` can be given for each.

export interface Arguments {
  readonly files: readonly string[];
  readonly fixture: WorkspaceFixtureName;
}

export function parseArguments(argv: readonly string[]): Arguments {
  const { values } = parseArgs({
    args: [...argv],
    options: {
      file: { type: 'string', multiple: true },
      'workspace-fixture': { type: 'string' },
    },
  });
  // `pnpm --filter` runs in the package folder: a relative path is the folder the command was typed in.
  const files = (values.file ?? []).map((file) => resolve(process.env.INIT_CWD ?? '.', file));
  if (files.length === 0) throw new Error('Give the file to check with --file <path>.');
  const fixture = values['workspace-fixture'];
  const names = Object.keys(WORKSPACE_FIXTURES).join(', ');
  if (fixture === undefined) {
    throw new Error(`Give a synthetic workspace with --workspace-fixture <name> (${names}).`);
  }
  if (!isWorkspaceFixtureName(fixture)) {
    throw new Error(`Unknown workspace fixture. Use one of: ${names}.`);
  }
  return { files, fixture };
}

/** `url` when its host is local; otherwise throws without echoing the URL (it holds the password). */
export function refuseNonLocalDatabase(url: string): string {
  return localServerUrl(url, 'IMPORT_DRY_RUN_DATABASE_URL', 'The import dry-run only runs against');
}

/** The sheet a CSV file holds: its file name without extension, after the last dot. */
export function sheetOfCsvFile(path: string): string {
  const name = basename(path, extname(path));
  return name.slice(name.lastIndexOf('.') + 1);
}

async function readFiles(
  files: readonly string[],
): Promise<{ kind: 'xlsx' | 'csv'; parsed: ParsedImport }> {
  const kinds = new Set(files.map((file) => extname(file).toLowerCase()));
  if (kinds.size === 1 && kinds.has('.xlsx') && files.length === 1) {
    return { kind: 'xlsx', parsed: await parseWorkbook(readFileSync(files[0] as string)) };
  }
  if (kinds.size === 1 && kinds.has('.csv')) {
    return {
      kind: 'csv',
      parsed: parseCsvFiles(
        Object.fromEntries(files.map((file) => [sheetOfCsvFile(file), readFileSync(file)])),
      ),
    };
  }
  throw new Error('Give one .xlsx workbook, or one or more .csv files.');
}

export interface Report {
  readonly fileKind: 'xlsx' | 'csv';
  readonly fixture: string;
  readonly check: ImportCheck;
  readonly plan: ImportPlan;
}

/** The output: counts, and the type, sheet and row of each problem, nothing from a cell. */
export function formatReport({ fileKind, fixture, check, plan }: Report): string {
  const lines = [`Import dry-run (${fileKind}, workspace fixture ${fixture})`];
  for (const [sheet, { rows }] of Object.entries(check.sheets))
    lines.push(`${sheet}: ${rows} rows`);
  const { clients, clientsToCreate, clientsReused, clientsSkipped } = plan.counts;
  lines.push(
    `Clients: ${clients} (${clientsToCreate} new, ${clientsReused} reused, ${clientsSkipped} left out)`,
  );
  const errors = check.problems.filter((problem) => problem.severity === 'error');
  const warnings = check.problems.filter((problem) => problem.severity === 'warning');
  if (check.problems.length === 0) {
    lines.push('Problems: none');
  } else {
    lines.push(
      `Problems: ${errors.length} ${errors.length === 1 ? 'error' : 'errors'}, ${warnings.length} ${warnings.length === 1 ? 'warning' : 'warnings'}`,
    );
    const describe = (problem: ImportProblem) =>
      `${problem.severity} ${problem.type} ${problem.sheet} row ${problem.row}`;
    lines.push(...check.problems.map(describe));
  }
  return lines.join('\n');
}

async function scratchDatabase<T>(serverUrl: string, use: (url: string) => Promise<T>): Promise<T> {
  const name = `fivvi_import_dryrun_${randomBytes(6).toString('hex')}`;
  const url = new URL(serverUrl);
  const admin = new pg.Client({ connectionString: serverUrl });
  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE "${name}"`);
    try {
      url.pathname = `/${name}`;
      const migrator = createDatabase({ url: url.toString(), maxConnections: 1 });
      try {
        await runMigrations(migrator.db);
      } finally {
        await migrator.close();
      }
      return await use(url.toString());
    } finally {
      await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    }
  } finally {
    await admin.end();
  }
}

/**
 * Checks and plans the files against the fixture workspace, loaded into the migrated database at
 * `databaseUrl` (a scratch database is made from a server URL when `scratch` is set). Returns the
 * report and whether the file could be imported.
 */
export async function dryRun(
  args: Arguments,
  databaseUrl: string,
  options: { scratch: boolean },
): Promise<{ report: string; canImport: boolean }> {
  const { kind, parsed } = await readFiles(args.files);
  const run = async (url: string) => {
    const client = createDatabase({ url, maxConnections: 1 });
    try {
      const workspaceId = await loadWorkspaceFixture(client.db, args.fixture);
      return await readWorkspaceSnapshot(client.db, workspaceId);
    } finally {
      await client.close();
    }
  };
  const snapshot = options.scratch
    ? await scratchDatabase(databaseUrl, run)
    : await run(databaseUrl);
  const check = checkImport(parsed, snapshot);
  const plan = planImport(parsed, snapshot);
  return {
    report: formatReport({ fileKind: kind, fixture: args.fixture, check, plan }),
    canImport: check.canImport,
  };
}

export async function main(argv: readonly string[], env: NodeJS.ProcessEnv): Promise<number> {
  try {
    const args = parseArguments(argv);
    const url = env.IMPORT_DRY_RUN_DATABASE_URL || env.TEST_DATABASE_URL;
    if (!url) {
      throw new Error(
        'Set IMPORT_DRY_RUN_DATABASE_URL to a local Postgres, e.g. the one from `pnpm db:up`.',
      );
    }
    const { report, canImport } = await dryRun(args, refuseNonLocalDatabase(url), {
      scratch: true,
    });
    console.log(report);
    return canImport ? 0 : 1;
  } catch (error) {
    // A refused file names its reason only; no other message can hold a cell value.
    const message =
      error instanceof ImportFileError
        ? `The file was refused: ${error.reason}.`
        : error instanceof Error
          ? error.message
          : 'The dry-run failed.';
    console.error(message);
    return 2;
  }
}

if (import.meta.main) {
  process.exitCode = await main(process.argv.slice(2), process.env);
}
