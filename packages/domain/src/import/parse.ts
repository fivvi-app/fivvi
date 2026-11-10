import readExcelFile from 'read-excel-file/universal';
import { parseCsv } from './csv.ts';

// Reading the file the Owner uploads (E015): a workbook with a sheet per kind, or one UTF-8 CSV per
// sheet. The file is read into memory and handed back as text; nothing is stored, and no cell is
// ever put in an error (a refusal names a reason only).

/** What a file may be: 5 MB and 5,000 rows (spec #478). */
export const IMPORT_LIMITS = {
  maxBytes: 5 * 1024 * 1024,
  maxRows: 5000,
  /** What a workbook may unpack to, by the sizes its zip directory declares: a guard against a zip bomb. */
  maxUnpackedBytes: 50 * 1024 * 1024,
} as const;

export type ImportFileErrorReason = 'too-large' | 'too-many-rows' | 'unreadable';

/** The file can't be checked at all. `reason` picks the message (`dataImport.fileErrors.*`). */
export class ImportFileError extends Error {
  readonly reason: ImportFileErrorReason;

  constructor(reason: ImportFileErrorReason) {
    super(`The import file was refused: ${reason}.`);
    this.name = 'ImportFileError';
    this.reason = reason;
  }
}

/** A data row of a sheet: its row number in the sheet (the header is row 1) and its cells by column. */
export interface ParsedRow {
  readonly row: number;
  readonly cells: Readonly<Record<string, string>>;
}

export interface ParsedSheet {
  /** The header names, trimmed and lower case. A column without a name is left out. */
  readonly columns: readonly string[];
  /** The rows with at least one cell filled in, in order. */
  readonly rows: readonly ParsedRow[];
}

/** The sheets of a file by name (`clients`), the same whether they came from a workbook or CSVs. */
export type ParsedImport = Readonly<Record<string, ParsedSheet>>;

function cellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).trim();
}

/** A sheet from rows of cells: the first row is the header. */
function toSheet(table: readonly (readonly unknown[])[]): ParsedSheet {
  const [header = [], ...body] = table;
  const names = header.map((name) => cellText(name).toLowerCase());
  const columns = names.filter((name) => name !== '');
  const rows: ParsedRow[] = [];
  body.forEach((cells, index) => {
    const entries = names.flatMap((name, at) => (name === '' ? [] : [[name, cellText(cells[at])]]));
    if (entries.every(([, value]) => value === '')) return;
    rows.push({ row: index + 2, cells: Object.fromEntries(entries) });
  });
  return { columns, rows };
}

function refuseTooManyRows(sheets: ParsedImport): void {
  const total = Object.values(sheets).reduce((sum, sheet) => sum + sheet.rows.length, 0);
  if (total > IMPORT_LIMITS.maxRows) throw new ImportFileError('too-many-rows');
}

/** The sizes the zip directory of a workbook declares, added up; throws `unreadable` if it isn't a zip. */
function declaredUnpackedBytes(bytes: Uint8Array): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let at = bytes.length - 22; at >= Math.max(0, bytes.length - 22 - 0xffff); at--) {
    if (view.getUint32(at, true) === 0x06054b50) {
      end = at;
      break;
    }
  }
  if (end < 0) throw new ImportFileError('unreadable');
  const entries = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  let total = 0;
  for (let entry = 0; entry < entries; entry++) {
    if (at + 46 > bytes.length || view.getUint32(at, true) !== 0x02014b50) {
      throw new ImportFileError('unreadable');
    }
    total += view.getUint32(at + 24, true);
    at +=
      46 +
      view.getUint16(at + 28, true) +
      view.getUint16(at + 30, true) +
      view.getUint16(at + 32, true);
  }
  return total;
}

/**
 * Reads an `.xlsx` workbook: one sheet per kind, named as the kind (`clients`), a header row first.
 * Refuses a file over 5 MB, one that unpacks to far more, one with more than 5,000 rows in all
 * its sheets, and one that isn't a workbook. Sheet names are lower-cased.
 */
export async function parseWorkbook(file: Uint8Array): Promise<ParsedImport> {
  if (file.byteLength > IMPORT_LIMITS.maxBytes) throw new ImportFileError('too-large');
  if (declaredUnpackedBytes(file) > IMPORT_LIMITS.maxUnpackedBytes) {
    throw new ImportFileError('too-large');
  }
  let workbook: Awaited<ReturnType<typeof readExcelFile>>;
  try {
    workbook = await readExcelFile(new Blob([new Uint8Array(file)]));
  } catch {
    throw new ImportFileError('unreadable');
  }
  const sheets = Object.fromEntries(
    workbook.map(({ sheet, data }) => [sheet.trim().toLowerCase(), toSheet(data)]),
  );
  refuseTooManyRows(sheets);
  return sheets;
}

/**
 * Reads the CSVs of an import, one UTF-8 text (or its bytes) per sheet, keyed by the sheet name.
 * The same limits as a workbook: 5 MB for all of them together, 5,000 rows.
 */
export function parseCsvFiles(files: Readonly<Record<string, string | Uint8Array>>): ParsedImport {
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const texts: [string, string][] = [];
  let bytes = 0;
  for (const [name, file] of Object.entries(files)) {
    bytes += typeof file === 'string' ? new TextEncoder().encode(file).length : file.byteLength;
    if (bytes > IMPORT_LIMITS.maxBytes) throw new ImportFileError('too-large');
    try {
      texts.push([
        name.trim().toLowerCase(),
        typeof file === 'string' ? file : decoder.decode(file),
      ]);
    } catch {
      throw new ImportFileError('unreadable');
    }
  }
  const sheets = Object.fromEntries(
    texts.map(([name, text]) => {
      try {
        return [name, toSheet(parseCsv(text))];
      } catch {
        throw new ImportFileError('unreadable');
      }
    }),
  );
  refuseTooManyRows(sheets);
  return sheets;
}
