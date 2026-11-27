import { messages } from '@fivvi/i18n';
import { describe, expect, it } from 'vitest';
import {
  CSV_BOM,
  csvLine,
  exportColumnNames,
  exportFileKey,
  exportFilesFor,
  exportReadme,
  exportRecord,
  localInstant,
} from './export.ts';
import { PRIVACY_REGISTRY } from './registry.ts';

const exportedTables = PRIVACY_REGISTRY.filter(
  (declaration) => declaration.personal && declaration.export.length > 0,
).map((declaration) => declaration.table);

describe('E014 export: which files an export holds', () => {
  it('the workspace export holds a file for every table of the registry that declares export fields', () => {
    expect(exportFilesFor('workspace').map((file) => file.table)).toEqual(exportedTables);
  });

  it('the workspace export names no table that is not exported (accounts, the deletion log)', () => {
    const tables = exportFilesFor('workspace').map((file) => file.table);
    expect(tables).not.toContain('auth_users');
    expect(tables).not.toContain('deletion_log');
  });

  it('the client export holds her profile, her places in sessions with their history, and the sessions', () => {
    const files = exportFilesFor('client');
    const tables = files.map((file) => file.table);
    expect(tables).toContain('clients');
    expect(tables).toContain('session_participants');
    expect(tables).toContain('session_participant_status_changes');
    expect(tables).toContain('sessions');
    // Every file of a client export finds the client's rows by her ID.
    expect(files.every((file) => file.clientLink !== undefined)).toBe(true);
    expect(files.find((file) => file.table === 'clients')?.clientLink).toBe('self');
    expect(files.find((file) => file.table === 'session_participants')?.clientLink).toBe(
      'client_id',
    );
    expect(files.find((file) => file.table === 'sessions')?.clientLink).toBe('sessions');
  });

  it('the client export holds nothing about the team, the workspace or the access log', () => {
    const tables = exportFilesFor('client').map((file) => file.table);
    for (const other of [
      'organizations',
      'team_members',
      'trainer_profiles',
      'trainer_invitations',
      'locations',
      'access_log',
      'workspace_invoice_details',
    ]) {
      expect(tables).not.toContain(other);
    }
  });

  it('the client export leaves out the Owner’s own words and the links to the staff that acted', () => {
    const files = exportFilesFor('client');
    const sessions = files.find((file) => file.table === 'sessions');
    expect(sessions?.fields).not.toContain('cancellation_message');
    expect(sessions?.fields).not.toContain('created_by_team_member_id');
    expect(sessions?.fields).toContain('starts_at');
    const history = files.find((file) => file.table === 'session_participant_status_changes');
    expect(history?.fields).not.toContain('actor_team_member_id');
    expect(history?.fields).not.toContain('actor_account_id');
    expect(history?.fields).toContain('to_status');
  });

  it('a file name is its table name, so a later feature’s table joins without a mapping', () => {
    for (const file of exportFilesFor('workspace')) expect(file.name).toBe(file.table);
  });
});

describe('E014 export: a record in JSON and CSV', () => {
  const when = new Date('2026-03-29T00:30:00.000Z');

  it('shows a time in UTC and in the workspace time zone, with the zone’s offset', () => {
    expect(localInstant(new Date('2026-01-15T10:00:00.000Z'), 'Europe/Amsterdam')).toBe(
      '2026-01-15T11:00:00.000+01:00',
    );
    expect(localInstant(new Date('2026-07-15T10:00:00.000Z'), 'Europe/Amsterdam')).toBe(
      '2026-07-15T12:00:00.000+02:00',
    );
    // The hour the clocks skip: 00:30 UTC is 01:30 in winter time, the last hour before the change.
    expect(localInstant(when, 'Europe/Amsterdam')).toBe('2026-03-29T01:30:00.000+01:00');
    expect(localInstant(new Date('2026-03-29T01:00:00.000Z'), 'Europe/Amsterdam')).toBe(
      '2026-03-29T03:00:00.000+02:00',
    );
  });

  it('adds a `_local` field next to every time, and leaves other values alone', () => {
    const record = exportRecord(
      { id: 'a', name: 'Anna de Vries', starts_at: when, capacity: 8, note: null },
      'Europe/Amsterdam',
    );
    expect(record).toEqual({
      id: 'a',
      name: 'Anna de Vries',
      starts_at: '2026-03-29T00:30:00.000Z',
      starts_at_local: '2026-03-29T01:30:00.000+01:00',
      capacity: 8,
      note: null,
    });
  });

  it('names the columns the same way, from the columns of the table', () => {
    expect(
      exportColumnNames([
        { name: 'id', time: false },
        { name: 'starts_at', time: true },
        { name: 'ends_at', time: true },
      ]),
    ).toEqual(['id', 'starts_at', 'starts_at_local', 'ends_at', 'ends_at_local']);
  });

  it('writes CSV with quotes only where needed and CRLF line ends', () => {
    expect(csvLine(['a', 'b c', 'd,e', 'f"g', 'h\ni', null, 3, true])).toBe(
      'a,b c,"d,e","f""g","h\ni",,3,true\r\n',
    );
  });

  it('writes a record that holds JSON (an array, an object) as JSON text', () => {
    expect(csvLine([['startsAt'], { a: 1 }])).toBe('"[""startsAt""]","{""a"":1}"\r\n');
  });

  it('keeps accents, and starts the file with a byte order mark so Excel reads UTF-8', () => {
    expect(CSV_BOM).toBe('﻿');
    expect(csvLine(['José Müller-Zoë'])).toBe('José Müller-Zoë\r\n');
  });

  it('defuses a text that a spreadsheet would run as a formula, and leaves numbers alone', () => {
    expect(csvLine(['=HYPERLINK("x")', '+31 6 1234', '-1 and', '@sum', '-500', '12.5'])).toBe(
      '"\'=HYPERLINK(""x"")",\'+31 6 1234,\'-1 and,\'@sum,-500,12.5\r\n',
    );
  });
});

describe('E014 export: the read-me', () => {
  const files = [
    { table: 'clients', rows: 1, columns: ['id', 'name', 'created_at', 'created_at_local'] },
    { table: 'sessions', rows: 4, columns: ['id', 'starts_at', 'starts_at_local'] },
  ];

  it('is in the Owner’s language: Dutch', () => {
    const text = exportReadme({
      kind: 'client',
      locale: 'nl-NL',
      workspaceName: "John's Gym",
      timeZone: 'Europe/Amsterdam',
      exportedAt: new Date('2026-11-27T09:00:00.000Z'),
      files,
    });
    expect(text).toContain('Gegevens exporteren');
    expect(text).toContain("John's Gym");
    expect(text).toContain('clients.csv');
    expect(text).toContain('data.json');
    expect(text).toContain('Europe/Amsterdam');
    expect(text).not.toContain('Export data');
  });

  it('is in the Owner’s language: English, with the field names', () => {
    const text = exportReadme({
      kind: 'workspace',
      locale: 'en',
      workspaceName: "John's Gym",
      timeZone: 'Europe/Amsterdam',
      exportedAt: new Date('2026-11-27T09:00:00.000Z'),
      files,
    });
    expect(text).toContain('Export data');
    expect(text).toContain('starts_at_local');
    expect(text).toContain('sessions.csv');
    expect(text).not.toContain('Gegevens exporteren');
  });

  it('says what each file is, for every table of the registry that is exported, in both languages', () => {
    for (const locale of ['nl-NL', 'en'] as const) {
      const described = messages[locale].privacyExport.files as Record<string, string>;
      for (const table of exportedTables) {
        expect(described[exportFileKey(table)], `${locale}: ${table}`).toBeTruthy();
      }
    }
  });
});
