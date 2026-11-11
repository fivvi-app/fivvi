import { readFileSync } from 'node:fs';
import { unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import {
  addColumn,
  buildImportSample,
  IMPORT_SAMPLE_FILES,
  IMPORT_SAMPLE_TRAINERS,
  importSampleProblems,
  importSampleSheets,
  setCell,
  toCsv,
  writeWorkbook,
} from './import-sample.ts';

const fixture = (name: string) => new URL(`../fixtures/${name}`, import.meta.url);

describe('E015 the synthetic import sample', () => {
  it('has 40 made-up clients K001 to K040 of John’s Gym, all at example.com', () => {
    const [header, ...rows] = importSampleSheets().clients ?? [];

    expect(header).toEqual([
      'client_key',
      'first_name',
      'last_name',
      'email',
      'language',
      'default_location',
      'trainer_email',
      'status',
    ]);
    expect(rows).toHaveLength(40);
    expect(rows[0]?.[0]).toBe('K001');
    expect(rows[39]?.[0]).toBe('K040');
    const emails = rows.map((row) => row[3] ?? '');
    expect(emails.every((email) => email.endsWith('@example.com'))).toBe(true);
    expect(new Set(emails).size).toBe(40);
    expect(rows.map((row) => row[7])).toEqual(Array(40).fill('active'));
    expect(
      rows.every((row) => (IMPORT_SAMPLE_TRAINERS as readonly string[]).includes(row[6] ?? '')),
    ).toBe(true);
  });

  it('gives the same bytes every time it is built', async () => {
    const first = await buildImportSample();
    const second = await buildImportSample();

    expect(Buffer.from(first.workbook).equals(Buffer.from(second.workbook))).toBe(true);
    expect(first.csv).toEqual(second.csv);
    expect(first.expected).toEqual(second.expected);
  });

  it('writes a workbook with a sheet per kind and a CSV with the same rows', async () => {
    const sample = await buildImportSample();
    const parts = unzipSync(sample.workbook);

    expect(Object.keys(parts)).toContain('xl/worksheets/sheet1.xml');
    expect(new TextDecoder().decode(parts['xl/workbook.xml'])).toContain('name="clients"');
    expect(sample.csv.clients?.split('\n')[0]).toBe(
      'client_key,first_name,last_name,email,language,default_location,trainer_email,status',
    );
    expect(sample.csv.clients?.split('\n')).toHaveLength(42); // header, 40 rows, a closing newline
    expect(sample.expected.counts.clients).toBe(40);
  });

  it('quotes CSV cells that hold a comma, a quote or a line break', () => {
    expect(toCsv([['a', 'b,c', 'd"e', 'f\ng']])).toBe('a,"b,c","d""e","f\ng"\n');
  });

  it('makes problem variants from the same rows', () => {
    const problems = importSampleProblems();
    const clean = importSampleSheets();

    expect(problems.clients).toHaveLength(clean.clients?.length ?? 0);
    expect(problems.clients).not.toEqual(clean.clients);
    expect(setCell(clean.clients ?? [], 2, 'status', 'inactive')[1]?.[7]).toBe('inactive');
    expect(addColumn(clean.clients ?? [], 'phone', () => '0600000000')[0]).toContain('phone');
  });

  it('writes a workbook with XML-special characters in a cell', () => {
    const parts = unzipSync(writeWorkbook({ clients: [['a'], ['x & <y>']] }));

    expect(new TextDecoder().decode(parts['xl/worksheets/sheet1.xml'])).toContain(
      'x &amp; &lt;y&gt;',
    );
  });

  it('matches the committed files: run `pnpm --filter @fivvi/testing generate:import-sample` after a change', async () => {
    const sample = await buildImportSample();

    expect(
      Buffer.from(sample.workbook).equals(readFileSync(fixture(IMPORT_SAMPLE_FILES.workbook))),
    ).toBe(true);
    expect(readFileSync(fixture(IMPORT_SAMPLE_FILES.csv('clients')), 'utf8')).toBe(
      sample.csv.clients,
    );
    expect(JSON.parse(readFileSync(fixture(IMPORT_SAMPLE_FILES.expected), 'utf8'))).toEqual(
      sample.expected,
    );
  });
});
