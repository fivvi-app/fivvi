import type { CatalogEntry, EmailAudience } from './catalog.ts';

/**
 * The email table of `docs/design/information-architecture.md` §8 against the catalog (F049 AC10):
 * the docs never list an email the code does not know or miss one it sends. `parseEmailTable` reads
 * the table, `checkEmailTable` says what differs, one sentence per problem.
 */

export interface EmailTableRow {
  /** `EM-02`. */
  id: string;
  /** The cells as written. */
  nl: string;
  en: string;
  to: string;
  trigger: string;
  features: string;
  /** The whole line, for checks of wording. */
  raw: string;
}

/** What the "To" column says for each audience of the catalog. */
const audienceLabels: Record<EmailAudience, string> = {
  client: 'Client',
  trainer: 'Trainer',
  owner: 'Owner',
  'invited-trainer': 'Invited trainer',
  anyone: 'Anyone signing in',
  'account-holder': 'Account holder',
};

/** The rows of the first table whose header starts with `| ID |` and holds subjects. */
export function parseEmailTable(markdown: string): EmailTableRow[] {
  const lines = markdown.split('\n');
  const start = lines.findIndex((line) => /^\|\s*ID\s*\|\s*NL subject/.test(line));
  if (start < 0) return [];
  const rows: EmailTableRow[] = [];
  for (const line of lines.slice(start + 2)) {
    if (!line.startsWith('|')) break;
    const cells = line
      .replace(/^\|/, '')
      .replace(/\|\s*$/, '')
      .split('|')
      .map((cell) => cell.trim());
    const id = /^EM-\d+/.exec(cells[0] ?? '')?.[0];
    if (!id) continue;
    rows.push({
      id,
      nl: cells[1] ?? '',
      en: cells[2] ?? '',
      to: cells[3] ?? '',
      trigger: cells[4] ?? '',
      features: cells[5] ?? '',
      raw: line,
    });
  }
  return rows;
}

export interface EmailTableInput {
  catalog: readonly CatalogEntry[];
  /** The subjects an active entry's template is built with, per language; none for the others. */
  subjectsOf: (entry: CatalogEntry) => readonly { nl: string; en: string }[];
}

const placeholdersOf = (subject: string): string =>
  [...subject.matchAll(/\{(\w+)\}/g)]
    .map((match) => match[1])
    .sort()
    .join(',');

/** A subject cell holds one subject or variants separated by " / "; italics mark a status. */
const variantsOf = (cell: string): string[] =>
  cell
    .split(' / ')
    .map((variant) => variant.trim())
    .filter(Boolean);

const isMarker = (cell: string): boolean => /^\*(retired|reserved)\b/i.test(cell);

const featuresOf = (cell: string): string[] => cell.match(/\b[FE]\d+\b/g) ?? [];

export function checkEmailTable(markdown: string, input: EmailTableInput): string[] {
  const problems: string[] = [];
  const rows = parseEmailTable(markdown);
  if (rows.length === 0) return ['the email table (| ID | NL subject | …) was not found'];

  const byId = new Map<string, EmailTableRow>();
  for (const row of rows) {
    if (byId.has(row.id)) problems.push(`${row.id} is in the table twice`);
    byId.set(row.id, row);
  }
  const catalogIds = new Set(input.catalog.map((entry) => entry.id as string));
  for (const row of rows) {
    if (!catalogIds.has(row.id)) problems.push(`${row.id} is in the table but not in the catalog`);
  }

  for (const entry of input.catalog) {
    const row = byId.get(entry.id);
    if (!row) {
      problems.push(`${entry.id} is in the catalog but not in the table`);
      continue;
    }
    const marked = /^\*retired\b/i.test(row.nl);
    if (entry.status === 'retired') {
      if (!marked) {
        problems.push(`${entry.id} is retired in the catalog but not marked retired in the table`);
      } else if (!row.nl.includes(entry.reason)) {
        problems.push(`${entry.id} is retired in the table without its reason (${entry.reason})`);
      }
      continue;
    }
    if (marked) {
      problems.push(
        `${entry.id} is marked retired in the table but is ${entry.status} in the catalog`,
      );
      continue;
    }

    const audience = audienceLabels[entry.audience];
    if (row.to !== audience) {
      problems.push(
        `${entry.id} audience is "${row.to}" in the table, "${audience}" in the catalog`,
      );
    }
    const tableOwners = featuresOf(row.features);
    if (tableOwners.join(', ') !== entry.owner.join(', ')) {
      problems.push(
        `${entry.id} owner features are ${tableOwners.join(', ') || 'none'} in the table, ${entry.owner.join(', ')} in the catalog`,
      );
    }

    if (isMarker(row.nl) || isMarker(row.en)) continue; // reserved without a subject yet
    const nl = variantsOf(row.nl);
    const en = variantsOf(row.en);
    if (nl.length === 0 || en.length === 0) {
      problems.push(`${entry.id} has no subject in ${nl.length === 0 ? 'NL' : 'EN'} in the table`);
      continue;
    }
    if (
      nl.length !== en.length ||
      nl.some((variant, index) => placeholdersOf(variant) !== placeholdersOf(en[index] ?? ''))
    ) {
      problems.push(`${entry.id} subjects differ in placeholders between NL and EN`);
    }
    for (const built of input.subjectsOf(entry)) {
      if (!nl.includes(built.nl)) {
        problems.push(`${entry.id} NL subject "${built.nl}" is built but not in the table`);
      }
      if (!en.includes(built.en)) {
        problems.push(`${entry.id} EN subject "${built.en}" is built but not in the table`);
      }
    }
  }
  return problems;
}
