import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { type CatalogEntry, catalog } from './catalog.ts';
import { checkEmailTable, parseEmailTable } from './catalog-docs.ts';
import { messageOf } from './template-checks.ts';

const informationArchitecture = readFileSync(
  fileURLToPath(new URL('../../../docs/design/information-architecture.md', import.meta.url)),
  'utf8',
);

/** The subjects a template is built with: the catalog's subject keys, read from both catalogs. */
function builtSubjects(entry: CatalogEntry): { nl: string; en: string }[] {
  if (entry.status !== 'active') return [];
  return entry.subjectKeys.map((key) => ({
    nl: messageOf('nl-NL', key) ?? '',
    en: messageOf('en', key) ?? '',
  }));
}

type CatalogLike = Parameters<typeof checkEmailTable>[1];

const header =
  '| ID | NL subject | EN subject | To | Trigger | Features |\n|---|---|---|---|---|---|';
const doc = (...rows: string[]) => `## 8. Emails\n\n${header}\n${rows.join('\n')}\n\n- after\n`;

const sampleCatalog: CatalogLike = {
  catalog: [
    { id: 'EM-01', status: 'retired', reason: 'ADR-026' },
    {
      id: 'EM-02',
      status: 'reserved',
      audience: 'client',
      owner: ['F031', 'F062'],
      subjectKeys: ['email.sample.subject'],
    },
  ],
  subjectsOf: () => [],
};

const goodRows = [
  '| EM-01 | *retired* (ADR-026) | | | The hold confirmation | |',
  '| EM-02 | Je boeking is bevestigd: {class} | Your booking is confirmed: {class} | Client | A booking is made | F031, F062 |',
];

describe('the information architecture email table and the catalog (F049 AC10)', () => {
  it('AC10: IDs, subjects, audience and owner features match, EM-01 is marked retired', () => {
    const rows = parseEmailTable(informationArchitecture);
    expect(rows.length).toBeGreaterThan(0);
    const problems = checkEmailTable(informationArchitecture, {
      catalog,
      subjectsOf: builtSubjects,
    });
    expect(problems).toEqual([]);
  });

  it('AC10: the table uses the glossary terms: no reservering, afmelding or inschrijving', () => {
    const table = parseEmailTable(informationArchitecture)
      .map((row) => row.raw)
      .join('\n');
    expect(table).not.toMatch(/reservering|afmelding|inschrijving/i);
  });

  it('is sound for a table that matches', () => {
    expect(checkEmailTable(doc(...goodRows), sampleCatalog)).toEqual([]);
  });

  it('fails when an ID is in the catalog and not in the table', () => {
    const problems = checkEmailTable(doc(goodRows[0] as string), sampleCatalog);
    expect(problems).toEqual([expect.stringContaining('EM-02 is in the catalog but not in')]);
  });

  it('fails when an ID is in the table and not in the catalog', () => {
    const extra = '| EM-99 | Hallo | Hello | Client | Never | F031 |';
    const problems = checkEmailTable(doc(...goodRows, extra), sampleCatalog);
    expect(problems).toEqual([
      expect.stringContaining('EM-99 is in the table but not in the catalog'),
    ]);
  });

  it('fails when an ID is in the table twice', () => {
    const problems = checkEmailTable(doc(...goodRows, goodRows[1] as string), sampleCatalog);
    expect(problems).toEqual([expect.stringContaining('EM-02 is in the table twice')]);
  });

  it('fails when a retired entry is not marked retired, and the reverse', () => {
    const unmarked =
      '| EM-01 | Bevestig je boeking | Confirm your booking | Client | Hold | F030 |';
    expect(checkEmailTable(doc(unmarked, goodRows[1] as string), sampleCatalog)).toEqual([
      expect.stringContaining('EM-01 is retired in the catalog but not marked retired'),
    ]);
    const marked = '| EM-02 | *retired* | | Client | x | F031, F062 |';
    expect(checkEmailTable(doc(goodRows[0] as string, marked), sampleCatalog)).toEqual([
      expect.stringContaining(
        'EM-02 is marked retired in the table but is reserved in the catalog',
      ),
    ]);
  });

  it('fails when the audience or the owner features differ', () => {
    const audience = goodRows[1]?.replace('| Client |', '| Trainer |') as string;
    expect(checkEmailTable(doc(goodRows[0] as string, audience), sampleCatalog)).toEqual([
      expect.stringContaining('EM-02 audience is "Trainer" in the table, "Client" in the catalog'),
    ]);
    const owners = goodRows[1]?.replace('F031, F062', 'F031') as string;
    expect(checkEmailTable(doc(goodRows[0] as string, owners), sampleCatalog)).toEqual([
      expect.stringContaining(
        'EM-02 owner features are F031 in the table, F031, F062 in the catalog',
      ),
    ]);
  });

  it('fails when the languages of a subject do not carry the same placeholders', () => {
    const row = goodRows[1]?.replace(
      'Your booking is confirmed: {class}',
      'Your booking is confirmed',
    ) as string;
    expect(checkEmailTable(doc(goodRows[0] as string, row), sampleCatalog)).toEqual([
      expect.stringContaining('EM-02 subjects differ in placeholders between NL and EN'),
    ]);
  });

  it('fails when a built subject is not one of the table subjects', () => {
    const built: CatalogLike = {
      catalog: sampleCatalog.catalog,
      subjectsOf: (entry) =>
        entry.id === 'EM-02' ? [{ nl: 'Iets anders', en: 'Something else' }] : [],
    };
    const problems = checkEmailTable(doc(...goodRows), built);
    expect(problems).toEqual([
      expect.stringContaining('EM-02 NL subject "Iets anders" is built but not in the table'),
      expect.stringContaining('EM-02 EN subject "Something else" is built but not in the table'),
    ]);
  });
});
