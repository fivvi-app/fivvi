import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cloneTemplateDatabase, type TestDatabase } from '@fivvi/testing/database';
import { onServer, serverUrl } from '@fivvi/testing/database/server';
import {
  buildImportSample,
  importSampleProblems,
  importSampleSheets,
  toCsv,
  writeWorkbook,
} from '@fivvi/testing/import-sample';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { dryRun, main } from './cli.ts';

let database: TestDatabase;
let folder: string;

beforeAll(async () => {
  folder = mkdtempSync(join(tmpdir(), 'fivvi-import-'));
  database = await cloneTemplateDatabase();
});

afterAll(async () => {
  rmSync(folder, { recursive: true, force: true });
  await database?.drop();
});

/** Each test loads its fixture into a database of its own, so none sees another's workspace. */
async function freshDatabase(): Promise<TestDatabase> {
  return await cloneTemplateDatabase();
}

describe('E015 the dry-run CLI against a local Postgres', () => {
  it('AC15: the sample workbook and John’s Gym give 40 clients and no problems', async () => {
    const sample = await buildImportSample();
    const file = join(folder, 'import-sample.xlsx');
    writeFileSync(file, sample.workbook);
    const scratch = await freshDatabase();
    try {
      const result = await dryRun({ files: [file], fixture: 'johns-gym' }, scratch.url, {
        scratch: false,
      });

      expect(result.canImport).toBe(true);
      expect(result.report).toContain('clients: 40 rows');
      expect(result.report).toContain('Clients: 40 (40 new, 0 reused, 0 left out)');
      expect(result.report).toContain('Problems: none');
    } finally {
      await scratch.drop();
    }
  });

  it('AC15: the same rows as a CSV give the same report', async () => {
    const sample = await buildImportSample();
    const workbook = join(folder, 'same.xlsx');
    const csv = join(folder, 'import-sample.clients.csv');
    writeFileSync(workbook, sample.workbook);
    writeFileSync(csv, sample.csv.clients ?? '');
    const first = await freshDatabase();
    const second = await freshDatabase();
    try {
      const fromWorkbook = await dryRun({ files: [workbook], fixture: 'johns-gym' }, first.url, {
        scratch: false,
      });
      const fromCsv = await dryRun({ files: [csv], fixture: 'johns-gym' }, second.url, {
        scratch: false,
      });

      expect(fromCsv.report.split('\n').slice(1)).toEqual(fromWorkbook.report.split('\n').slice(1));
    } finally {
      await first.drop();
      await second.drop();
    }
  });

  it('AC15: the problem variant prints error types with sheet and row, and no name, email or cell value', async () => {
    const sheets = importSampleProblems();
    const file = join(folder, 'problems.xlsx');
    writeFileSync(file, writeWorkbook(sheets));
    const scratch = await freshDatabase();
    try {
      const result = await dryRun({ files: [file], fixture: 'johns-gym' }, scratch.url, {
        scratch: false,
      });

      expect(result.canImport).toBe(false);
      expect(result.report).toContain('Problems: 8 errors, 0 warnings');
      expect(result.report).toContain('error client-key-duplicate clients row 5');
      expect(result.report).toContain('error email-duplicate clients row 7');
      expect(result.report).toContain('error email-invalid clients row 9');
      expect(result.report).toContain('error email-missing clients row 11');
      expect(result.report).toContain('error trainer-unknown clients row 15');
      const cells = (sheets.clients ?? [])
        .slice(1)
        .flat()
        .filter((cell) => cell.length > 3);
      for (const cell of cells) expect(result.report).not.toContain(cell);
      expect(result.report).not.toMatch(/@/);
    } finally {
      await scratch.drop();
    }
  });

  it('plans the client of the existing-client fixture as reused', async () => {
    const file = join(folder, 'clients.csv');
    writeFileSync(file, toCsv(importSampleSheets().clients ?? []));
    const scratch = await freshDatabase();
    try {
      const result = await dryRun(
        { files: [file], fixture: 'johns-gym-existing-client' },
        scratch.url,
        { scratch: false },
      );

      expect(result.canImport).toBe(true);
      expect(result.report).toContain('Clients: 40 (39 new, 1 reused, 0 left out)');
      expect(result.report).toContain('warning client-exists clients row 2');
    } finally {
      await scratch.drop();
    }
  });

  it('AC15: main makes a scratch database on the local server, prints the report and drops it', async () => {
    const file = join(folder, 'main.xlsx');
    writeFileSync(file, (await buildImportSample()).workbook);
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    const code = await main(['--file', file, '--workspace-fixture', 'johns-gym'], {
      TEST_DATABASE_URL: serverUrl(),
    });

    expect(code).toBe(0);
    expect(log.mock.calls.flat().join('\n')).toContain('Clients: 40');
    const left = await onServer<{ datname: string }>(
      "SELECT datname FROM pg_database WHERE datname LIKE 'fivvi_import_dryrun_%'",
    );
    expect(left).toEqual([]);
  });
});
