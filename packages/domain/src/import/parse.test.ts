import { buildImportSample, toCsv, writeWorkbook } from '@fivvi/testing/import-sample';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { IMPORT_LIMITS, ImportFileError, parseCsvFiles, parseWorkbook } from './parse.ts';

async function refusal(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
  } catch (error) {
    return error instanceof ImportFileError ? error.reason : `other: ${String(error)}`;
  }
  return undefined;
}

describe('E015 reading the import file', () => {
  it('reads the clients sheet of the sample workbook with its header and rows numbered as in the sheet', async () => {
    const sample = await buildImportSample();

    const parsed = await parseWorkbook(sample.workbook);

    const clients = parsed.clients;
    expect(clients?.columns).toEqual([
      'client_key',
      'first_name',
      'last_name',
      'email',
      'language',
      'default_location',
      'trainer_email',
      'status',
    ]);
    expect(clients?.rows).toHaveLength(40);
    expect(clients?.rows[0]?.row).toBe(2);
    expect(clients?.rows[0]?.cells.client_key).toBe('K001');
    expect(clients?.rows[39]?.row).toBe(41);
    expect(clients?.rows[0]?.cells.default_location).toBe('');
  });

  it('reads the same rows from the CSV of the sheet as from the workbook', async () => {
    const sample = await buildImportSample();

    const fromWorkbook = await parseWorkbook(sample.workbook);
    const fromCsv = parseCsvFiles({ clients: sample.csv.clients ?? '' });

    expect(fromCsv).toEqual(fromWorkbook);
  });

  it('reads CSV bytes as UTF-8, with a byte order mark', () => {
    const bytes = new TextEncoder().encode('﻿client_key,first_name\nK001,Zoë\n');

    const parsed = parseCsvFiles({ clients: bytes });

    expect(parsed.clients?.rows[0]?.cells.first_name).toBe('Zoë');
  });

  it('trims cells, lower-cases header names, skips empty rows and keeps the row numbers', () => {
    const parsed = parseCsvFiles({
      clients: ' Client_Key ,Email\n K001 , A@Example.com \n,\nK003,\n',
    });

    expect(parsed.clients?.columns).toEqual(['client_key', 'email']);
    expect(parsed.clients?.rows).toEqual([
      { row: 2, cells: { client_key: 'K001', email: 'A@Example.com' } },
      { row: 4, cells: { client_key: 'K003', email: '' } },
    ]);
  });

  it('turns a number cell into text', async () => {
    const parts = unzipSync(
      writeWorkbook({
        clients: [
          ['client_key', 'first_name'],
          ['K1', 'Anna'],
        ],
      }),
    );
    const sheet = strFromU8(parts['xl/worksheets/sheet1.xml'] ?? new Uint8Array());
    parts['xl/worksheets/sheet1.xml'] = strToU8(
      sheet.replace('t="inlineStr"><is><t xml:space="preserve">K1</t></is>', '><v>12</v>'),
    );

    const parsed = await parseWorkbook(zipSync(parts));

    expect(parsed.clients?.rows[0]?.cells.client_key).toBe('12');
  });

  it('refuses a workbook over 5 MB without reading it', async () => {
    const big = new Uint8Array(IMPORT_LIMITS.maxBytes + 1);

    expect(await refusal(parseWorkbook(big))).toBe('too-large');
  });

  it('refuses CSVs over 5 MB together', () => {
    const text = `client_key\n${'K'.repeat(IMPORT_LIMITS.maxBytes)}\n`;

    expect(() => parseCsvFiles({ clients: text })).toThrow(ImportFileError);
    expect(() => parseCsvFiles({ clients: text })).toThrow(/too-large/);
  });

  it('refuses a file with more than 5,000 rows, in a workbook and in CSVs', async () => {
    const rows = [
      ['client_key'],
      ...Array.from({ length: IMPORT_LIMITS.maxRows + 1 }, (_, i) => [`K${i}`]),
    ];

    expect(await refusal(parseWorkbook(writeWorkbook({ clients: rows })))).toBe('too-many-rows');
    expect(() => parseCsvFiles({ clients: toCsv(rows) })).toThrow(/too-many-rows/);
  });

  it('accepts a file with exactly 5,000 rows', () => {
    const rows = [
      ['client_key'],
      ...Array.from({ length: IMPORT_LIMITS.maxRows }, (_, i) => [`K${i}`]),
    ];

    expect(parseCsvFiles({ clients: toCsv(rows) }).clients?.rows).toHaveLength(
      IMPORT_LIMITS.maxRows,
    );
  });

  it('refuses a file that is not a workbook', async () => {
    expect(await refusal(parseWorkbook(new TextEncoder().encode('client_key,email\n')))).toBe(
      'unreadable',
    );
  });

  it('refuses a workbook whose zip directory declares far more than the limit', async () => {
    const bomb = zipSync({ 'xl/worksheets/sheet1.xml': strToU8('<worksheet/>') });
    const view = new DataView(bomb.buffer, bomb.byteOffset, bomb.byteLength);
    const directory = view.getUint32(bomb.length - 22 + 16, true);
    view.setUint32(directory + 24, IMPORT_LIMITS.maxUnpackedBytes + 1, true);

    expect(await refusal(parseWorkbook(bomb))).toBe('too-large');
  });

  it('refuses CSV bytes that are not UTF-8', () => {
    expect(() => parseCsvFiles({ clients: new Uint8Array([0x63, 0xff, 0xfe]) })).toThrow(
      /unreadable/,
    );
  });
});
