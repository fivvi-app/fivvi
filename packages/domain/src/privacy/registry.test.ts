import * as schema from '@fivvi/database';
import { getTableColumns, getTableName, is } from 'drizzle-orm';
import { PgTable } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import {
  declaredTable,
  PRIVACY_REGISTRY,
  type PrivacyDeclaration,
  tablesMissingFromRegistry,
  tablesNotInSchema,
} from './registry.ts';
import { RETENTION } from './retention.ts';

/** Every table the Drizzle schema declares, by its name in the database. */
const schemaTables = Object.values(schema).filter((value) => is(value, PgTable)) as PgTable[];
const schemaTableNames = schemaTables.map((table) => getTableName(table));

function columnsOf(tableName: string): string[] {
  const table = schemaTables.find((candidate) => getTableName(candidate) === tableName);
  if (!table) return [];
  return Object.values(getTableColumns(table)).map((column) => column.name);
}

describe('E014 AC1: every table in the schema is in the privacy registry', () => {
  it('AC1: every table in the schema is in the privacy registry', () => {
    expect(schemaTableNames.length).toBeGreaterThan(10);
    expect(tablesMissingFromRegistry(schemaTableNames)).toEqual([]);
  });

  it('fails with the name of a table that was added to the schema and not declared', () => {
    const withNewTable = [...schemaTableNames, 'f099_workout_notes'];
    expect(tablesMissingFromRegistry(withNewTable)).toEqual(['f099_workout_notes']);
  });

  it('fails with the name of a declaration whose table is gone from the schema', () => {
    const withoutClients = schemaTableNames.filter((name) => name !== 'clients');
    expect(tablesNotInSchema(withoutClients)).toEqual(['clients']);
    expect(tablesNotInSchema(schemaTableNames)).toEqual([]);
  });

  it('declares each table once', () => {
    const names = PRIVACY_REGISTRY.map((declaration) => declaration.table);
    expect(new Set(names).size).toBe(names.length);
  });

  it('declares the platform and the business tables of main', () => {
    for (const table of [
      'auth_users',
      'auth_sessions',
      'auth_identities',
      'auth_verifications',
      'auth_rate_limits',
      'organizations',
      'job_runs',
      'system_greetings',
      'exercise_library',
      'team_members',
      'trainer_profiles',
      'clients',
      'locations',
      'group_classes',
      'sessions',
      'session_participants',
      'trainer_invitations',
    ]) {
      expect(declaredTable(table), table).toBeDefined();
    }
  });

  it('names columns that exist: every personal-data and export field is a column of its table', () => {
    for (const declaration of PRIVACY_REGISTRY) {
      if (!declaration.personal) continue;
      const columns = columnsOf(declaration.table);
      for (const field of [...declaration.personalData, ...declaration.export]) {
        expect(columns, `${declaration.table}.${field}`).toContain(field);
      }
    }
  });

  it('lists every column that links to a person (*_team_member_id, *_account_id, *_client_id, *_user_id, *_trainer_profile_id) in personalData, unless the declaration leaves it out on purpose with a reason', () => {
    const linksToPerson = /(^|_)(team_member|account|client|user|trainer_profile)_id$/;
    const unlisted: string[] = [];
    for (const table of schemaTables) {
      const name = getTableName(table);
      const declaration = declaredTable(name);
      const listed = declaration?.personal ? declaration.personalData : [];
      const leftOut = declaration?.personal ? Object.keys(declaration.leftOut ?? {}) : [];
      for (const column of columnsOf(name)) {
        if (!linksToPerson.test(column)) continue;
        if (!listed.includes(column) && !leftOut.includes(column))
          unlisted.push(`${name}.${column}`);
      }
    }
    expect(unlisted).toEqual([]);
  });

  it('gives a reason for every column a declaration leaves out on purpose, and never lists the same column as personal data', () => {
    for (const declaration of PRIVACY_REGISTRY) {
      if (!declaration.personal) continue;
      for (const [column, reason] of Object.entries(declaration.leftOut ?? {})) {
        expect(columnsOf(declaration.table), `${declaration.table}.${column}`).toContain(column);
        expect(declaration.personalData, `${declaration.table}.${column}`).not.toContain(column);
        expect(reason, `${declaration.table}.${column}`).not.toBe('');
      }
    }
  });

  it('never exports a secret: no token, hash or code leaves in an export', () => {
    for (const declaration of PRIVACY_REGISTRY) {
      if (!declaration.personal) continue;
      for (const field of declaration.export) {
        expect(field, `${declaration.table}.${field}`).not.toMatch(
          /(^|_)(token|hash|code)(_|$)|^organization_id$/,
        );
      }
    }
  });

  it('says what deletion does to every table that holds personal data, and why a table has none', () => {
    for (const declaration of PRIVACY_REGISTRY) {
      if (declaration.personal) {
        expect(['delete', 'anonymize', 'keep-for-law']).toContain(declaration.onDelete);
        expect(['client', 'account', 'team_member', 'workspace']).toContain(declaration.subject);
        expect(declaration.personalData.length, declaration.table).toBeGreaterThan(0);
      } else {
        expect(declaration.reason, declaration.table).not.toBe('');
      }
    }
  });

  it('gives a retention constant that exists to every declaration that names one, and to every keep-for-law', () => {
    for (const declaration of PRIVACY_REGISTRY) {
      if (!declaration.personal) continue;
      if (declaration.retention) expect(Object.keys(RETENTION)).toContain(declaration.retention);
      if (declaration.onDelete === 'keep-for-law') expect(declaration.retention).toBeDefined();
    }
  });

  it('uses the retention constant of the policy for the tables with a timer', () => {
    const retentionOf = (table: string) => {
      const declaration: PrivacyDeclaration | undefined = declaredTable(table);
      return declaration?.personal ? declaration.retention : undefined;
    };
    expect(retentionOf('auth_verifications')).toBe('SIGN_IN_TOKEN_AFTER_EXPIRY');
    expect(retentionOf('auth_rate_limits')).toBe('RATE_LIMIT');
    expect(retentionOf('clients')).toBe('TRASH');
    expect(retentionOf('trainer_invitations')).toBe('TRAINER_INVITATION_AFTER_CLOSING');
  });

  it('AC21/AC22 (E014 #1173): declares the access log under its 12-month constant and the deletion log under its 30-day constant', () => {
    const access = declaredTable('access_log');
    const deletion = declaredTable('deletion_log');
    expect(access?.personal && access.retention).toBe('ACCESS_LOG');
    expect(deletion?.personal && deletion.retention).toBe('DELETION_LOG');
    expect(RETENTION.ACCESS_LOG).toEqual({ unit: 'months', amount: 12 });
    expect(RETENTION.DELETION_LOG).toEqual({ unit: 'days', amount: 30 });
  });

  it('keeps the entries of both logs unchanged until their retention constant ends, whoever is deleted', () => {
    // The tables are write-once and the access log's client action needs the client ID; a restore
    // re-applies the deletion log after the workspace is gone (retention-policy.md §3.5).
    for (const table of ['access_log', 'deletion_log']) {
      const declaration = declaredTable(table);
      expect(declaration?.personal && declaration.onDelete, table).toBe('keep-for-law');
    }
  });

  it('exports no content from the logs: only IDs, the action and the time', () => {
    const access = declaredTable('access_log');
    expect(access?.personal && access.export).toEqual([
      'id',
      'actor_team_member_id',
      'action',
      'subject_client_id',
      'object_id',
      'occurred_at',
      'created_at',
      'updated_at',
    ]);
  });

  it('keeps the booking and attendance of a deleted client as an anonymous count', () => {
    const participants = declaredTable('session_participants');
    expect(participants?.personal && participants.onDelete).toBe('anonymize');
    const clients = declaredTable('clients');
    expect(clients?.personal && clients.onDelete).toBe('delete');
  });
});
