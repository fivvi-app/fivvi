import { parseArgs } from 'node:util';
import type { DatabaseClient } from './client.ts';
import {
  checkMarkers,
  compareCounts,
  countsPass,
  countTables,
  formatCounts,
  MARKER_KINDS,
  type MarkerKind,
  removeDrill,
  writeMarker,
} from './restore.ts';

// The command line of the restore drill's database helper (E016). `scripts/restore.ts` is the one
// file that opens the privileged connection (reason `restore`) and hands this module an `open`
// function, so what is here can be tested without it. A connection is named by the environment
// variable that holds its URL (`--database-url-env`), never given as an argument: an argument
// shows in the process list and in the shell history. The output is environment names, times,
// table names and counts; no row value, no URL, and an error prints its own message only.

export const USAGE = [
  'Usage:',
  '  restore markers write --database-url-env <VAR> --kind <before|after> --at <RFC3339>',
  '  restore markers check --database-url-env <VAR>',
  '  restore markers remove --database-url-env <VAR>',
  '  restore counts --source-url-env <VAR> --restored-url-env <VAR> --at <RFC3339>',
  '                 [--source-name <name>] [--restored-name <name>]',
].join('\n');

export interface RestoreDeps {
  /** Opens the privileged connection whose URL is in the environment variable `variable`. */
  open(variable: string): DatabaseClient;
  /** Where a line of output goes. */
  out(line: string): void;
}

/** Thrown for a mistake in the arguments; its message is safe to print. */
class UsageError extends Error {}

const NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

function parseTime(value: string | undefined): Date {
  if (!value || !/^\d{4}-\d{2}-\d{2}T/.test(value)) {
    throw new UsageError('--at must be an RFC 3339 time, e.g. 2026-11-10T09:00:00Z.');
  }
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) throw new UsageError('--at is not a valid time.');
  return at;
}

function required(value: string | undefined, option: string): string {
  if (!value) throw new UsageError(`${option} is required.`);
  return value;
}

function label(value: string | undefined, fallback: string, option: string): string {
  if (value === undefined) return fallback;
  if (!NAME.test(value))
    throw new UsageError(`${option} may hold letters, digits, ., _ and - only.`);
  return value;
}

async function withDatabase<T>(
  deps: RestoreDeps,
  variable: string,
  run: (client: DatabaseClient) => Promise<T>,
): Promise<T> {
  const client = deps.open(variable);
  try {
    return await run(client);
  } finally {
    await client.close();
  }
}

/** Runs one command and returns the exit code: 0 passed, 1 a check failed, 2 the arguments or the run failed. */
export async function runRestore(argv: readonly string[], deps: RestoreDeps): Promise<number> {
  try {
    return await run(argv, deps);
  } catch (error) {
    if (error instanceof UsageError) {
      deps.out(`Error: ${error.message}`);
      deps.out(USAGE);
    } else {
      // Not the message: a driver's message can hold a statement or a detail with a value.
      const code = (error as { code?: unknown } | undefined)?.code;
      deps.out(
        `Error: the restore helper failed${typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code) ? ` (${code})` : ''}.`,
      );
      if (error instanceof Error && error.message.startsWith('The connection cannot')) {
        deps.out(error.message);
      }
    }
    return 2;
  }
}

async function run(argv: readonly string[], deps: RestoreDeps): Promise<number> {
  let parsed: ReturnType<typeof parse>;
  try {
    parsed = parse(argv);
  } catch {
    // The message of the parser can quote an argument, and an argument could be a URL.
    throw new UsageError('The arguments are not valid.');
  }
  const { values, positionals } = parsed;
  const [command, subcommand] = positionals;

  if (command === 'markers' && subcommand === 'write') {
    const kind = values.kind as MarkerKind;
    if (!MARKER_KINDS.includes(kind)) throw new UsageError('--kind is "before" or "after".');
    const at = parseTime(values.at);
    const variable = required(values['database-url-env'], '--database-url-env');
    await withDatabase(deps, variable, (client) => writeMarker(client.db, kind, at));
    deps.out(`Marker ${kind} written for ${at.toISOString()}.`);
    return 0;
  }
  if (command === 'markers' && subcommand === 'check') {
    const variable = required(values['database-url-env'], '--database-url-env');
    const report = await withDatabase(deps, variable, (client) => checkMarkers(client.db));
    deps.out(`Marker before the point: ${report.before ? 'found' : 'missing'}.`);
    deps.out(`Marker after the point: ${report.after ? 'found' : 'absent'}.`);
    deps.out(report.ok ? 'Markers: passed.' : 'Markers: failed.');
    return report.ok ? 0 : 1;
  }
  if (command === 'markers' && subcommand === 'remove') {
    const variable = required(values['database-url-env'], '--database-url-env');
    const removed = await withDatabase(deps, variable, (client) => removeDrill(client.db));
    deps.out(removed ? 'Drill table removed.' : 'No drill table to remove.');
    return 0;
  }
  if (command === 'counts' && subcommand === undefined) {
    const sourceVariable = required(values['source-url-env'], '--source-url-env');
    const restoredVariable = required(values['restored-url-env'], '--restored-url-env');
    const at = parseTime(values.at);
    const names = {
      source: label(values['source-name'], 'source', '--source-name'),
      restored: label(values['restored-name'], 'restored', '--restored-name'),
    };
    const source = await withDatabase(deps, sourceVariable, (client) => countTables(client.db, at));
    const restored = await withDatabase(deps, restoredVariable, (client) => countTables(client.db));
    const comparison = compareCounts(source, restored);
    deps.out(`Row counts of ${names.source} and ${names.restored}, point ${at.toISOString()}.`);
    for (const line of formatCounts(comparison, names)) deps.out(line);
    const differing = comparison.filter(
      (entry) => entry.status !== 'match' && entry.status !== 'within-changes',
    );
    if (countsPass(comparison)) {
      deps.out(`Counts: passed (${comparison.length} tables).`);
      return 0;
    }
    deps.out(`Counts: failed (${differing.map((entry) => entry.table).join(', ')}).`);
    return 1;
  }
  throw new UsageError('Unknown command.');
}

function parse(argv: readonly string[]) {
  return parseArgs({
    args: [...argv],
    allowPositionals: true,
    strict: true,
    options: {
      'database-url-env': { type: 'string' },
      'source-url-env': { type: 'string' },
      'restored-url-env': { type: 'string' },
      'source-name': { type: 'string' },
      'restored-name': { type: 'string' },
      kind: { type: 'string' },
      at: { type: 'string' },
    },
  });
}
