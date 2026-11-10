import { strToU8, zipSync } from 'fflate';

// The synthetic sample of the data import (E015, spec #478): a made-up workbook of John's Gym and
// the same rows as one UTF-8 CSV per sheet, with the counts the importer must find. Nothing here is
// real or pseudonymised data (`AGENTS.md`, D8): names are invented, addresses are at example.com.
// Later tickets of the spec add the rows of their sheets to `importSampleSheets()`.
//
// `pnpm --filter @fivvi/testing generate:import-sample` writes `fixtures/`; a test fails when the
// committed files differ from what this module builds, and the output is the same every time.

/** A sheet as the template has it: the header row first, then one array of cells per record. */
export type SampleSheet = string[][];
export type SampleSheets = Record<string, SampleSheet>;

/** The workspace of the sample and its trainers, joined (the `johns-gym` fixture of the CLI). */
export const IMPORT_SAMPLE_WORKSPACE = "John's Gym";
export const IMPORT_SAMPLE_TRAINERS = ['sarah@example.com', 'tom@example.com'] as const;

/** The file names under `packages/testing/fixtures/`. */
export const IMPORT_SAMPLE_FILES = {
  workbook: 'import-sample.xlsx',
  expected: 'import-sample.expected.json',
  csv: (sheet: string) => `import-sample.${sheet}.csv`,
} as const;

export const CLIENT_COLUMNS = [
  'client_key',
  'first_name',
  'last_name',
  'email',
  'language',
  'default_location',
  'trainer_email',
  'status',
] as const;

const FIRST_NAMES = [
  'Anna',
  'Bram',
  'Chantal',
  'Daan',
  'Eva',
  'Finn',
  'Gerrit',
  'Hanneke',
  'Ivo',
  'Jasmijn',
  'Kees',
  'Lotte',
  'Milan',
  'Noor',
  'Olivier',
  'Puck',
  'Quinten',
  'Roos',
  'Sander',
  'Zoë',
];
const LAST_NAMES = [
  'de Vries',
  'Jansen',
  'van der Berg',
  'Bakker',
  'Visser',
  'Smit',
  'Meijer',
  "van 't Hof",
];

function slug(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.|\.$/g, '');
}

function sampleClients(): SampleSheet {
  const rows = Array.from({ length: 40 }, (_, index) => {
    // 20 first names and 8 last names: the pair repeats only after 40 clients.
    const first = FIRST_NAMES[index % FIRST_NAMES.length] ?? '';
    const last = LAST_NAMES[index % LAST_NAMES.length] ?? '';
    return [
      `K${String(index + 1).padStart(3, '0')}`,
      first,
      last,
      `${slug(first)}.${slug(last)}@example.com`,
      index % 5 === 4 ? 'en' : 'nl',
      '',
      IMPORT_SAMPLE_TRAINERS[index % 2] ?? '',
      'active',
    ];
  });
  return [[...CLIENT_COLUMNS], ...rows];
}

/** The sheets of the sample: today only `clients`. A new array each call, safe to change. */
export function importSampleSheets(): SampleSheets {
  return { clients: sampleClients() };
}

/** `rows` with the cell of the data row at spreadsheet row `row` (the header is row 1) replaced. */
export function setCell(
  rows: SampleSheet,
  row: number,
  column: string,
  value: string,
): SampleSheet {
  const header = rows[0] ?? [];
  const index = header.indexOf(column);
  if (index < 0) throw new Error(`No column ${column}.`);
  if (row < 2 || row > rows.length) throw new Error(`No row ${row}.`);
  return rows.map((cells, at) =>
    at === row - 1 ? cells.map((cell, cellIndex) => (cellIndex === index ? value : cell)) : cells,
  );
}

/** `rows` with a column added at the end: its name in the header, `value(row)` in every other row. */
export function addColumn(
  rows: SampleSheet,
  name: string,
  value: (row: number) => string,
): SampleSheet {
  return rows.map((cells, at) => [...cells, at === 0 ? name : value(at + 1)]);
}

/**
 * Where `importSampleProblems()` puts each problem, as spreadsheet rows of the `clients` sheet.
 * The duplicates are reported on the second occurrence.
 */
export const PROBLEM_ROWS = {
  duplicateKey: 5,
  duplicateEmail: 7,
  invalidEmail: 9,
  missingEmail: 11,
  languageNotSupported: 13,
  unknownTrainer: 15,
  statusNotSupported: 17,
  missingFirstName: 19,
} as const;

/** The sample with each data problem of `import-checklist.md` §5 that the `clients` sheet has. */
export function importSampleProblems(): SampleSheets {
  let clients = sampleClients();
  const cell = (row: number, column: string) => {
    const index = (clients[0] ?? []).indexOf(column);
    return clients[row - 1]?.[index] ?? '';
  };
  clients = setCell(clients, PROBLEM_ROWS.duplicateKey, 'client_key', cell(4, 'client_key'));
  clients = setCell(clients, PROBLEM_ROWS.duplicateEmail, 'email', cell(6, 'email'));
  clients = setCell(clients, PROBLEM_ROWS.invalidEmail, 'email', 'not-an-email.example.com');
  clients = setCell(clients, PROBLEM_ROWS.missingEmail, 'email', '');
  clients = setCell(clients, PROBLEM_ROWS.languageNotSupported, 'language', 'fr');
  clients = setCell(clients, PROBLEM_ROWS.unknownTrainer, 'trainer_email', 'nobody@example.com');
  clients = setCell(clients, PROBLEM_ROWS.statusNotSupported, 'status', 'archived');
  clients = setCell(clients, PROBLEM_ROWS.missingFirstName, 'first_name', '');
  return { clients };
}

function csvCell(cell: string): string {
  return /[",\n\r]/.test(cell) ? `"${cell.replaceAll('"', '""')}"` : cell;
}

/** One UTF-8 CSV for a sheet: a comma between cells, a line feed after every row, quotes where needed. */
export function toCsv(rows: SampleSheet): string {
  return rows.map((cells) => `${cells.map(csvCell).join(',')}\n`).join('');
}

function columnLetters(index: number): string {
  let letters = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    letters = String.fromCharCode(65 + ((n - 1) % 26)) + letters;
  }
  return letters;
}

function xml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function sheetXml(rows: SampleSheet): string {
  const body = rows
    .map((cells, rowIndex) => {
      const cellXml = cells
        .map((cell, cellIndex) =>
          cell === ''
            ? ''
            : `<c r="${columnLetters(cellIndex)}${rowIndex + 1}" t="inlineStr"><is><t xml:space="preserve">${xml(cell)}</t></is></c>`,
        )
        .join('');
      return `<row r="${rowIndex + 1}">${cellXml}</row>`;
    })
    .join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`;
}

// A fixed time for every zip entry (local fields, so the bytes don't depend on the time zone).
const ZIP_TIME = new Date(2027, 0, 1, 0, 0, 0);

/**
 * An `.xlsx` workbook with one sheet per key, in key order. Written by hand, with inline strings
 * and a fixed time in every entry, so the same rows always give the same bytes.
 */
export function writeWorkbook(sheets: SampleSheets): Uint8Array {
  const names = Object.keys(sheets);
  const main = 'http://schemas.openxmlformats.org/officeDocument/2006';
  const files: Record<string, string> = {
    '[Content_Types].xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${names
      .map(
        (_, index) =>
          `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
      )
      .join('')}</Types>`,
    '_rels/.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${main}/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    'xl/workbook.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${main}/relationships"><sheets>${names
      .map(
        (name, index) =>
          `<sheet name="${xml(name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`,
      )
      .join('')}</sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${names
      .map(
        (_, index) =>
          `<Relationship Id="rId${index + 1}" Type="${main}/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`,
      )
      .join('')}</Relationships>`,
  };
  names.forEach((name, index) => {
    files[`xl/worksheets/sheet${index + 1}.xml`] = sheetXml(sheets[name] ?? []);
  });
  return zipSync(
    Object.fromEntries(Object.entries(files).map(([path, text]) => [path, strToU8(text)])),
    { level: 6, mtime: ZIP_TIME },
  );
}

export interface ImportSample {
  /** `import-sample.xlsx` */
  workbook: Uint8Array;
  /** The same sheets, one CSV text each. */
  csv: Record<string, string>;
  /** What the importer must find in the sample: the content of `import-sample.expected.json`. */
  expected: { workspace: string; counts: { clients: number } };
}

/** The sample as bytes and texts. Async so a later sheet can be written without changing callers. */
export function buildImportSample(): Promise<ImportSample> {
  const sheets = importSampleSheets();
  return Promise.resolve({
    workbook: writeWorkbook(sheets),
    csv: Object.fromEntries(Object.entries(sheets).map(([name, rows]) => [name, toCsv(rows)])),
    expected: {
      workspace: IMPORT_SAMPLE_WORKSPACE,
      counts: { clients: (sheets.clients?.length ?? 1) - 1 },
    },
  });
}
