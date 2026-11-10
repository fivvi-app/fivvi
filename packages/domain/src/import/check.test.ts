import {
  addColumn,
  IMPORT_SAMPLE_TRAINERS,
  IMPORT_SAMPLE_WORKSPACE,
  importSampleProblems,
  importSampleSheets,
  PROBLEM_ROWS,
  setCell,
  toCsv,
  writeWorkbook,
} from '@fivvi/testing/import-sample';
import { describe, expect, it } from 'vitest';
import { checkImport, type ImportProblem, type WorkspaceSnapshot } from './check.ts';
import { describeFileError, describeProblem } from './messages.ts';
import { type ParsedImport, parseCsvFiles, parseWorkbook } from './parse.ts';
import { planImport } from './plan.ts';

const johnsGym: WorkspaceSnapshot = {
  name: IMPORT_SAMPLE_WORKSPACE,
  trainerEmails: [...IMPORT_SAMPLE_TRAINERS],
  clients: [],
};

function parsed(sheets: Record<string, string[][]>): ParsedImport {
  return parseCsvFiles(
    Object.fromEntries(
      Object.entries(sheets).map(([name, rows]) => [
        name,
        rows.map((cells) => cells.join(',')).join('\n'),
      ]),
    ),
  );
}

const clients = (rows: string[][]) => parsed({ clients: rows });
const find = (problems: readonly ImportProblem[], type: ImportProblem['type']) =>
  problems.filter((problem) => problem.type === type);

describe('E015 checking the clients sheet', () => {
  it('finds no problem in the sample and counts its 40 clients', () => {
    const result = checkImport(clients(importSampleSheets().clients ?? []), johnsGym);

    expect(result.problems).toEqual([]);
    expect(result.canImport).toBe(true);
    expect(result.sheets.clients).toEqual({ rows: 40 });
  });

  it('AC3: reports each data problem with sheet, row, column, type and a message in Dutch and English', () => {
    const result = checkImport(clients(importSampleProblems().clients ?? []), johnsGym);
    const at = (type: ImportProblem['type']) => {
      const [problem, ...more] = find(result.problems, type);
      expect(more).toEqual([]);
      return problem as ImportProblem;
    };

    const duplicateKey = at('client-key-duplicate');
    expect(duplicateKey).toMatchObject({
      severity: 'error',
      sheet: 'clients',
      row: PROBLEM_ROWS.duplicateKey,
      column: 'client_key',
    });
    expect(describeProblem(duplicateKey, 'nl-NL')).toBe(
      'Rij 5: client_key K003 komt twee keer voor.',
    );
    expect(describeProblem(duplicateKey, 'en')).toBe('Row 5: client_key K003 appears twice.');

    expect(at('email-duplicate')).toMatchObject({
      row: PROBLEM_ROWS.duplicateEmail,
      column: 'email',
    });
    expect(describeProblem(at('email-duplicate'), 'nl-NL')).toBe(
      'Rij 7: dit e-mailadres staat ook in rij 6.',
    );
    expect(describeProblem(at('email-duplicate'), 'en')).toBe(
      'Row 7: this email address is also in row 6.',
    );

    expect(at('email-invalid')).toMatchObject({ row: PROBLEM_ROWS.invalidEmail, column: 'email' });
    expect(describeProblem(at('email-invalid'), 'nl-NL')).toBe(
      'Rij 9: dit e-mailadres klopt niet.',
    );
    expect(describeProblem(at('email-invalid'), 'en')).toBe(
      "Row 9: this email address doesn't look right.",
    );

    expect(at('email-missing')).toMatchObject({ row: PROBLEM_ROWS.missingEmail, column: 'email' });
    expect(describeProblem(at('email-missing'), 'nl-NL')).toBe('Rij 11: e-mailadres ontbreekt.');
    expect(describeProblem(at('email-missing'), 'en')).toBe('Row 11: email address is missing.');

    expect(at('language-not-supported')).toMatchObject({
      row: PROBLEM_ROWS.languageNotSupported,
      column: 'language',
    });
    expect(describeProblem(at('language-not-supported'), 'en')).toBe(
      'Row 13: language must be nl or en.',
    );

    expect(at('trainer-unknown')).toMatchObject({
      row: PROBLEM_ROWS.unknownTrainer,
      column: 'trainer_email',
    });
    expect(describeProblem(at('trainer-unknown'), 'nl-NL')).toBe(
      "Rij 15: nobody@example.com is geen trainer van John's Gym.",
    );
    expect(describeProblem(at('trainer-unknown'), 'en')).toBe(
      "Row 15: nobody@example.com isn't a trainer of John's Gym.",
    );

    expect(at('status-not-supported')).toMatchObject({
      row: PROBLEM_ROWS.statusNotSupported,
      column: 'status',
    });
    expect(at('value-missing')).toMatchObject({
      row: PROBLEM_ROWS.missingFirstName,
      column: 'first_name',
    });
    expect(describeProblem(at('value-missing'), 'nl-NL')).toBe('Rij 19: first_name ontbreekt.');
    expect(result.problems).toHaveLength(8);
    expect(result.canImport).toBe(false);
    expect(result.problems.every((problem) => problem.severity === 'error')).toBe(true);
  });

  it('refuses a header that appears twice, as an error at row 1, and says nothing of its cells', () => {
    const rows = importSampleSheets().clients ?? [];
    const file = clients(addColumn(rows, 'Email', () => 'second@example.com'));

    const result = checkImport(file, johnsGym);

    const repeated = find(result.problems, 'column-repeated');
    expect(repeated).toHaveLength(1);
    expect(repeated[0]).toMatchObject({
      severity: 'error',
      sheet: 'clients',
      row: 1,
      column: 'email',
    });
    expect(describeProblem(repeated[0] as ImportProblem, 'nl-NL')).toBe(
      'Kolom email staat twee keer in het bestand.',
    );
    expect(describeProblem(repeated[0] as ImportProblem, 'en')).toBe(
      'Column email appears twice in the file.',
    );
    expect(result.canImport).toBe(false);
  });

  it('warns about a column with data but no header name, by its letter, and stores nothing of it', () => {
    const rows = importSampleSheets().clients ?? [];
    const file = clients(addColumn(rows, '', () => 'synthetic cell'));

    const result = checkImport(file, johnsGym);
    const plan = planImport(file, johnsGym);

    const unnamed = find(result.problems, 'column-without-name');
    expect(unnamed).toHaveLength(1);
    expect(unnamed[0]).toMatchObject({
      severity: 'warning',
      sheet: 'clients',
      row: 1,
      column: 'I',
    });
    expect(describeProblem(unnamed[0] as ImportProblem, 'nl-NL')).toBe(
      'Kolom I heeft geen naam en wordt niet geïmporteerd.',
    );
    expect(describeProblem(unnamed[0] as ImportProblem, 'en')).toBe(
      "Column I has no name and isn't imported.",
    );
    expect(result.canImport).toBe(true);
    expect(JSON.stringify(plan)).not.toContain('synthetic cell');
  });

  it('does not warn about an empty column without a header name', () => {
    const rows = importSampleSheets().clients ?? [];
    const result = checkImport(clients(addColumn(rows, '', () => '')), johnsGym);

    expect(find(result.problems, 'column-without-name')).toEqual([]);
  });

  it('AC12: refuses a column outside the template and never puts its values in the plan', () => {
    let rows = importSampleSheets().clients ?? [];
    rows = addColumn(rows, 'phone', () => '0600000000');
    rows = addColumn(rows, 'Date_of_Birth', () => '1900-01-01');
    rows = addColumn(rows, 'iban', () => 'NL00TEST0000000000');
    rows = addColumn(rows, 'notes', () => 'synthetic note');
    const file = clients(rows);

    const result = checkImport(file, johnsGym);
    const plan = planImport(file, johnsGym);

    const refused = find(result.problems, 'column-not-imported');
    expect(refused.map((problem) => problem.column)).toEqual([
      'phone',
      'date_of_birth',
      'iban',
      'notes',
    ]);
    expect(refused.every((problem) => problem.severity === 'error' && problem.row === 1)).toBe(
      true,
    );
    expect(describeProblem(refused[0] as ImportProblem, 'nl-NL')).toBe(
      'Kolom phone wordt niet geïmporteerd.',
    );
    expect(describeProblem(refused[0] as ImportProblem, 'en')).toBe("Column phone isn't imported.");
    expect(result.canImport).toBe(false);
    const planText = JSON.stringify(plan);
    for (const value of ['0600000000', '1900-01-01', 'NL00TEST0000000000', 'synthetic note']) {
      expect(planText).not.toContain(value);
    }
    expect(plan.counts.clients).toBe(40);
  });

  it('reports a missing clients sheet and a missing required column once, not row by row', () => {
    expect(checkImport(parsed({ other: [['x']] }), johnsGym).problems).toEqual([
      expect.objectContaining({ type: 'sheet-missing', severity: 'error', sheet: 'clients' }),
    ]);

    const withoutEmail = checkImport(
      clients([
        ['client_key', 'first_name', 'status'],
        ['K001', 'Anna', 'active'],
        ['K002', 'Bram', 'active'],
      ]),
      johnsGym,
    );
    expect(withoutEmail.problems).toEqual([
      expect.objectContaining({ type: 'column-missing', column: 'email', row: 1 }),
    ]);
    expect(describeProblem(withoutEmail.problems[0] as ImportProblem, 'nl-NL')).toBe(
      'Kolom email ontbreekt.',
    );
  });

  it('leaves inactive clients out with a warning that does not block', () => {
    const rows = setCell(importSampleSheets().clients ?? [], 3, 'status', 'inactive');
    const file = clients(rows);

    const result = checkImport(file, johnsGym);
    const plan = planImport(file, johnsGym);

    expect(result.problems).toEqual([
      expect.objectContaining({ type: 'client-inactive', severity: 'warning', row: 3 }),
    ]);
    expect(result.canImport).toBe(true);
    expect(plan.counts).toMatchObject({ clients: 39, clientsSkipped: 1 });
    expect(plan.clients.map((client) => client.sourceKey)).not.toContain('K002');
  });

  it('plans a client whose email belongs to a client of the workspace as reused, with the warning', () => {
    const file = clients(importSampleSheets().clients ?? []);
    const workspace: WorkspaceSnapshot = {
      ...johnsGym,
      clients: [{ id: 'existing-1', email: 'Anna.De.Vries@Example.com ' }],
    };

    const result = checkImport(file, workspace);
    const plan = planImport(file, workspace);

    const [warning, ...more] = result.problems;
    expect(more).toEqual([]);
    expect(warning).toMatchObject({
      type: 'client-exists',
      severity: 'warning',
      row: 2,
      column: 'email',
    });
    expect(describeProblem(warning as ImportProblem, 'nl-NL')).toBe(
      'Rij 2: er bestaat al een klant met dit e-mailadres.',
    );
    expect(describeProblem(warning as ImportProblem, 'en')).toBe(
      'Row 2: a client with this email address already exists.',
    );
    expect(result.canImport).toBe(true);
    expect(plan.counts).toEqual({
      clients: 40,
      clientsToCreate: 39,
      clientsReused: 1,
      clientsSkipped: 0,
    });
    expect(plan.clients[0]).toMatchObject({
      row: 2,
      sourceKey: 'K001',
      action: 'reuse',
      existingClientId: 'existing-1',
    });
    expect(plan.clients[1]).toMatchObject({ action: 'create', existingClientId: null });
  });

  it('plans the template columns of a client and nothing else, with the default language', () => {
    const file = clients([
      ['client_key', 'first_name', 'last_name', 'email', 'language', 'trainer_email', 'status'],
      ['K1', 'Anna', 'de Vries', ' Anna@Example.com', '', ' Sarah@example.com', 'Active'],
      ['K2', 'Bram', '', 'bram@example.com', 'EN', '', 'active'],
    ]);

    expect(planImport(file, johnsGym).clients).toEqual([
      {
        row: 2,
        sourceKey: 'K1',
        firstName: 'Anna',
        lastName: 'de Vries',
        email: 'anna@example.com',
        language: 'nl',
        trainerEmail: 'sarah@example.com',
        action: 'create',
        existingClientId: null,
      },
      {
        row: 3,
        sourceKey: 'K2',
        firstName: 'Bram',
        lastName: '',
        email: 'bram@example.com',
        language: 'en',
        trainerEmail: null,
        action: 'create',
        existingClientId: null,
      },
    ]);
  });

  it('leaves a row with an error out of the plan', () => {
    const plan = planImport(clients(importSampleProblems().clients ?? []), johnsGym);

    expect(plan.counts.clients).toBe(40 - 8);
  });

  it('gives the same check and plan for the workbook as for the CSVs, with problems and without', async () => {
    const workspace: WorkspaceSnapshot = {
      ...johnsGym,
      clients: [{ id: 'existing-1', email: 'bram.jansen@example.com' }],
    };
    for (const sheets of [importSampleSheets(), importSampleProblems()]) {
      const workbook = await parseWorkbook(writeWorkbook(sheets));
      const csv = parseCsvFiles({ clients: toCsv(sheets.clients ?? []) });

      expect(checkImport(workbook, workspace)).toEqual(checkImport(csv, workspace));
      expect(planImport(workbook, workspace)).toEqual(planImport(csv, workspace));
    }
  });

  it('describes a refused file in both languages', () => {
    expect(describeFileError('too-large', 'nl-NL')).toBe('Dit bestand is groter dan 5 MB.');
    expect(describeFileError('too-many-rows', 'en')).toBe('This file has more than 5,000 rows.');
    expect(describeFileError('unreadable', 'en')).toContain('UTF-8 CSV');
  });
});
