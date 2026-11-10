import { describe, expect, it, vi } from 'vitest';
import type { ImportProblem } from './check.ts';
import {
  formatReport,
  main,
  parseArguments,
  refuseNonLocalDatabase,
  sheetOfCsvFile,
} from './cli.ts';

const problem = (overrides: Partial<ImportProblem>): ImportProblem => ({
  severity: 'error',
  type: 'email-invalid',
  sheet: 'clients',
  row: 9,
  column: 'email',
  values: { row: '9' },
  ...overrides,
});

describe('E015 the dry-run CLI', () => {
  it('reads --file (more than once for CSVs) and --workspace-fixture', () => {
    expect(parseArguments(['--file', '/data/a.xlsx', '--workspace-fixture', 'johns-gym'])).toEqual({
      files: ['/data/a.xlsx'],
      fixture: 'johns-gym',
    });
    expect(
      parseArguments([
        '--file',
        '/data/a.csv',
        '--file',
        '/data/b.csv',
        '--workspace-fixture',
        'johns-gym',
      ]).files,
    ).toEqual(['/data/a.csv', '/data/b.csv']);
  });

  it('reads a relative --file from the folder the command was typed in', () => {
    vi.stubEnv('INIT_CWD', '/home/owner/exports');

    expect(
      parseArguments(['--file', 'clients.csv', '--workspace-fixture', 'johns-gym']).files,
    ).toEqual(['/home/owner/exports/clients.csv']);
  });

  it('refuses missing arguments and an unknown fixture', () => {
    expect(() => parseArguments(['--workspace-fixture', 'johns-gym'])).toThrow('--file');
    expect(() => parseArguments(['--file', 'a.xlsx'])).toThrow('--workspace-fixture');
    expect(() => parseArguments(['--file', 'a.xlsx', '--workspace-fixture', 'nope'])).toThrow(
      'johns-gym',
    );
  });

  it('names the sheet of a CSV after its file', () => {
    expect(sheetOfCsvFile('/tmp/clients.csv')).toBe('clients');
    expect(sheetOfCsvFile('/tmp/import-sample.clients.csv')).toBe('clients');
  });

  it('refuses a database that is not local, without echoing it', () => {
    const remote = 'postgres://someone:secret-pw@db.example.net:5432/app';

    expect(() => refuseNonLocalDatabase(remote)).toThrow('localhost');
    try {
      refuseNonLocalDatabase(remote);
    } catch (error) {
      expect(String(error)).not.toContain('secret-pw');
      expect(String(error)).not.toContain('db.example.net');
    }
    expect(refuseNonLocalDatabase('postgres://u:p@localhost:5432/x')).toBe(
      'postgres://u:p@localhost:5432/x',
    );
  });

  it('prints counts, and error types with sheet and row, and no name, email or cell value', () => {
    const report = formatReport({
      fileKind: 'xlsx',
      fixture: 'johns-gym',
      check: {
        problems: [
          problem({ values: { row: '9', email: 'secret@example.com' } }),
          problem({ severity: 'warning', type: 'client-inactive', row: 3, column: 'status' }),
          problem({ type: 'column-not-imported', row: 1, column: 'phone' }),
        ],
        canImport: false,
        sheets: { clients: { rows: 40 } },
      },
      plan: {
        counts: { clients: 38, clientsToCreate: 37, clientsReused: 1, clientsSkipped: 1 },
        clients: [],
      },
    });

    expect(report).toContain('clients: 40 rows');
    expect(report).toContain('Clients: 38 (37 new, 1 reused, 1 left out)');
    expect(report).toContain('Problems: 2 errors, 1 warning');
    expect(report).toContain('error email-invalid clients row 9');
    expect(report).toContain('warning client-inactive clients row 3');
    expect(report).toContain('error column-not-imported clients row 1');
    expect(report).not.toContain('secret@example.com');
    expect(report).not.toContain('phone');
  });

  it('says there are no problems when there are none', () => {
    const report = formatReport({
      fileKind: 'csv',
      fixture: 'johns-gym',
      check: { problems: [], canImport: true, sheets: { clients: { rows: 40 } } },
      plan: {
        counts: { clients: 40, clientsToCreate: 40, clientsReused: 0, clientsSkipped: 0 },
        clients: [],
      },
    });

    expect(report).toContain('Clients: 40 (40 new, 0 reused, 0 left out)');
    expect(report).toContain('Problems: none');
  });

  it('AC15: pointed at a database that is not local it refuses to run, before it reads the file', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    const code = await main(['--file', 'missing.xlsx', '--workspace-fixture', 'johns-gym'], {
      IMPORT_DRY_RUN_DATABASE_URL: 'postgres://someone:secret-pw@db.example.net:5432/app',
    });

    expect(code).toBe(2);
    const printed = error.mock.calls.flat().join('\n');
    expect(printed).toContain('localhost');
    expect(printed).not.toContain('secret-pw');
    expect(printed).not.toContain('db.example.net');
  });

  it('asks for a database when none is set', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(await main(['--file', 'a.xlsx', '--workspace-fixture', 'johns-gym'], {})).toBe(2);
    expect(error.mock.calls.flat().join('\n')).toContain('IMPORT_DRY_RUN_DATABASE_URL');
  });
});
