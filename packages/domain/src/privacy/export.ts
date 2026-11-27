// Module: The export of a client's or a workspace's data (Owner): which files a ZIP holds, read from
//        the privacy registry (`exportFilesFor`), a record in JSON and CSV with every time in UTC
//        and in the workspace time zone (`exportRecord`, `localInstant`), the CSV writer (UTF-8
//        with a BOM, formulas defused) and the read-me in the Owner's language (`exportReadme`)
// Spec: E014 AC8, AC9

import { type Locale, messages } from '@fivvi/i18n';
import { createTranslator } from 'use-intl/core';
import { PRIVACY_REGISTRY } from './registry.ts';

// The export of E014 (spec #477, tickets #1177 and #1178): everything a workspace holds about one
// client, or the whole workspace, as `README.txt`, `data.json` and one CSV per kind of record. What
// is in it is what the privacy registry declares (`export` fields), so a later feature's table
// joins the export by declaring its fields. Pure: reading the rows and writing the ZIP are the
// database's and the API's.

export type ExportKind = 'client' | 'workspace';

/** How a table's rows are found for one client: her own row, her `client_id`, or the sessions she was in. */
export type ClientLink = 'self' | 'client_id' | 'sessions';

export interface ExportFile {
  /** The table of the registry; also the name of the files (`<name>.csv`). */
  readonly table: string;
  readonly name: string;
  /** The columns to export, in order. */
  readonly fields: readonly string[];
  /** Only for the client export: how to find her rows. */
  readonly clientLink?: ClientLink;
}

/**
 * What a client's export leaves out: the Owner's own words on a cancellation and the links to the
 * staff who acted. The export is for the client; the staff's own data is theirs.
 */
const LEFT_OUT_OF_A_CLIENT_EXPORT: ReadonlySet<string> = new Set([
  'cancellation_message',
  'created_by_team_member_id',
  'updated_by_team_member_id',
  'cancelled_by_team_member_id',
  'actor_team_member_id',
  'actor_account_id',
  'requested_by_team_member_id',
  'changed_by',
]);

/** The sessions a client was in are exported with the sessions table, which is the team's data. */
const SESSIONS_TABLE = 'sessions';

function clientLinkOf(table: string, fields: readonly string[]): ClientLink | undefined {
  if (table === 'clients') return 'self';
  if (table === SESSIONS_TABLE) return 'sessions';
  return fields.includes('client_id') ? 'client_id' : undefined;
}

/**
 * The files of an export, in the order of the registry. The workspace export holds a file for every
 * table that declares export fields. The client export holds the tables that name the client (her
 * `client_id`), her own row and the sessions she was in, without the staff's own data.
 */
export function exportFilesFor(kind: ExportKind): ExportFile[] {
  const files: ExportFile[] = [];
  for (const declaration of PRIVACY_REGISTRY) {
    if (!declaration.personal || declaration.export.length === 0) continue;
    const { table } = declaration;
    if (kind === 'workspace') {
      files.push({ table, name: table, fields: declaration.export });
      continue;
    }
    const clientLink = clientLinkOf(table, declaration.export);
    if (!clientLink) continue;
    files.push({
      table,
      name: table,
      fields: declaration.export.filter((field) => !LEFT_OUT_OF_A_CLIENT_EXPORT.has(field)),
      clientLink,
    });
  }
  return files;
}

/** `session_participants` → `sessionParticipants`: the key of the file's description in `packages/i18n`. */
export function exportFileKey(table: string): string {
  return table.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

/** A column of a table as the database reports it: `time` for a timestamp. */
export interface ExportColumn {
  readonly name: string;
  readonly time: boolean;
}

/** The columns of an exported table: every time is followed by the same time in the workspace's zone. */
export function exportColumnNames(columns: readonly ExportColumn[]): string[] {
  return columns.flatMap((column) =>
    column.time ? [column.name, `${column.name}_local`] : [column.name],
  );
}

/**
 * An instant as the workspace's wall clock shows it, with the zone's offset:
 * `2026-07-15T12:00:00.000+02:00`.
 */
export function localInstant(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'longOffset',
  }).formatToParts(instant);
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value ?? '';
  // `GMT+01:00`, or `GMT` for an offset of zero.
  const offset = part('timeZoneName').replace('GMT', '') || '+00:00';
  const millis = String(instant.getUTCMilliseconds()).padStart(3, '0');
  return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}:${part('second')}.${millis}${offset}`;
}

export type ExportValue = string | number | boolean | null | Date | object;

/**
 * One row as the export shows it, for JSON and CSV alike: a time becomes its UTC instant and, next
 * to it, the same instant in the workspace time zone (`<field>_local`); nothing else changes.
 */
export function exportRecord(
  row: Readonly<Record<string, ExportValue>>,
  timeZone: string,
): Record<string, string | number | boolean | null | object> {
  const record: Record<string, string | number | boolean | null | object> = {};
  for (const [field, value] of Object.entries(row)) {
    if (value instanceof Date) {
      record[field] = value.toISOString();
      record[`${field}_local`] = localInstant(value, timeZone);
    } else {
      record[field] = value;
    }
  }
  return record;
}

/** Excel opens a CSV as UTF-8 (accents intact) when it starts with this byte order mark. */
export const CSV_BOM = '﻿';

const PLAIN_NUMBER = /^[+-]?\d+(\.\d+)?$/;

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let text = typeof value === 'object' ? JSON.stringify(value) : String(value);
  // A text a spreadsheet would run as a formula (CSV injection) is shown as text.
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text) && !PLAIN_NUMBER.test(text)) {
    text = `'${text}`;
  }
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** One CSV line (RFC 4180: comma, CRLF) of the values. */
export function csvLine(values: readonly unknown[]): string {
  return `${values.map(csvCell).join(',')}\r\n`;
}

function translator(locale: Locale) {
  const translate = createTranslator({
    locale: locale === 'nl-NL' ? 'nl-NL' : 'en-GB',
    messages: messages[locale],
    onError: (error) => {
      throw error;
    },
  });
  return (key: string, values: Record<string, string | number> = {}) =>
    (translate as unknown as (key: string, values: Record<string, string | number>) => string)(
      key,
      values,
    );
}

export interface ReadmeFile {
  readonly table: string;
  /** How many records the file holds. */
  readonly rows: number;
  /** The CSV's columns, in order (`exportColumnNames`). */
  readonly columns: readonly string[];
}

export interface ReadmeInput {
  readonly kind: ExportKind;
  /** The language of the Owner who exports. */
  readonly locale: Locale;
  readonly workspaceName: string;
  readonly timeZone: string;
  readonly exportedAt: Date;
  readonly files: readonly ReadmeFile[];
}

/** `README.txt`: what the ZIP is, what each file is and what its field names mean, in the Owner's language. */
export function exportReadme(input: ReadmeInput): string {
  const t = translator(input.locale);
  const lines = [
    t('privacyExport.readme.title'),
    '',
    t(
      input.kind === 'client'
        ? 'privacyExport.readme.introClient'
        : 'privacyExport.readme.introWorkspace',
      { workspace: input.workspaceName },
    ),
    t('privacyExport.readme.created', {
      date: input.exportedAt.toISOString(),
      timeZone: input.timeZone,
    }),
    '',
    t('privacyExport.readme.filesHeading'),
    `- data.json: ${t('privacyExport.readme.dataJson')}`,
    ...input.files.map(
      (file) =>
        `- ${file.table}.csv: ${t(`privacyExport.files.${exportFileKey(file.table)}`)} (${t('privacyExport.readme.records', { count: file.rows })})`,
    ),
    '',
    t('privacyExport.readme.fieldsHeading'),
    ...input.files.map((file) => `- ${file.table}.csv: ${file.columns.join(', ')}`),
    '',
    t('privacyExport.readme.conventionsHeading'),
    t('privacyExport.readme.conventionId'),
    t('privacyExport.readme.conventionTime'),
    t('privacyExport.readme.conventionLocal', { timeZone: input.timeZone }),
    t('privacyExport.readme.conventionMoney'),
    t('privacyExport.readme.conventionEmpty'),
    t('privacyExport.readme.conventionCsv'),
  ];
  return `${lines.join('\n')}\n`;
}
