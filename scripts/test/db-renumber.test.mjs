import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { checkMigrations, renumberMigrations } from '../db-renumber.mjs';

const SCRIPT = join(import.meta.dirname, '..', 'db-renumber.mjs');
const DIR = 'packages/database/migrations';

// Two PRs that each add a migration take the same number (E001 #1273). The tests build a repository of fake migrations
// (journal, snapshots with a few tables, SQL) in which `main` and a `feature` branch each add some, and run the script
// on the branch. No database is involved.
let base;
let repo;
const gitEnv = () => ({
  PATH: process.env.PATH,
  HOME: base,
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 'Test',
  GIT_AUTHOR_EMAIL: 'test@users.noreply.github.com',
  GIT_COMMITTER_NAME: 'Test',
  GIT_COMMITTER_EMAIL: 'test@users.noreply.github.com',
});
const git = (...args) =>
  execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', env: gitEnv() });
const gitTry = (...args) =>
  spawnSync('git', ['-C', repo, ...args], { encoding: 'utf8', env: gitEnv() });
const write = (path, text) => {
  mkdirSync(dirname(join(repo, path)), { recursive: true });
  writeFileSync(join(repo, path), text);
};
const read = (path) => readFileSync(join(repo, path), 'utf8');
const readJson = (path) => JSON.parse(read(path));
const pad = (n) => String(n).padStart(4, '0');
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
/** A snapshot id that differs for two migrations of one number from different branches. */
const idOf = (tag) =>
  uuid([...tag].reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) % 1e9, 7));

/** A column set: `{ id: 'uuid' }` becomes the snapshot's column objects. */
const table = (name, columns) => ({
  name,
  schema: '',
  columns: Object.fromEntries(
    Object.entries(columns).map(([column, type]) => [
      column,
      { name: column, type, primaryKey: false, notNull: true },
    ]),
  ),
  indexes: {},
});

const snapshot = (id, tables) => ({
  id,
  prevId: uuid(0),
  version: '7',
  dialect: 'postgresql',
  tables: Object.fromEntries(
    Object.entries(tables).map(([name, cols]) => [`public.${name}`, table(name, cols)]),
  ),
  enums: {},
  schemas: {},
  sequences: {},
  roles: {},
  policies: {},
  views: {},
  _meta: { columns: {}, schemas: {}, tables: {} },
});

/**
 * Adds migration `n` named `name` as drizzle-kit writes it: the SQL, the snapshot (the tables of everything before it
 * plus `tables`), a journal entry. Tags are the file name; `when` is the time it was generated.
 */
const addMigration = (n, name, tables, when) => {
  const tag = `${pad(n)}_${name}`;
  const journalPath = `${DIR}/meta/_journal.json`;
  const journal = existsSync(join(repo, journalPath))
    ? readJson(journalPath)
    : { version: '7', dialect: 'postgresql', entries: [] };
  const previous = journal.entries.length
    ? readJson(`${DIR}/meta/${pad(n - 1)}_snapshot.json`).tables
    : {};
  const merged = { ...previous };
  const snap = snapshot(idOf(tag), {});
  for (const [tableName, cols] of Object.entries(tables))
    merged[`public.${tableName}`] = table(tableName, cols);
  snap.tables = merged;
  snap.prevId = journal.entries.length
    ? readJson(`${DIR}/meta/${pad(n - 1)}_snapshot.json`).id
    : uuid(0);
  journal.entries.push({ idx: n, version: '7', when, tag, breakpoints: true });
  write(
    `${DIR}/${tag}.sql`,
    `${Object.keys(tables)
      .map((t) => `CREATE TABLE "${t}" ();`)
      .join('\n--> statement-breakpoint\n')}\n`,
  );
  write(`${DIR}/meta/${pad(n)}_snapshot.json`, JSON.stringify(snap, null, 2));
  write(journalPath, JSON.stringify(journal, null, 2));
  return tag;
};

const commit = (message) => {
  git('add', '-A');
  git('commit', '--quiet', '--allow-empty', '-m', message);
};

beforeEach(() => {
  base = realpathSync(mkdtempSync(join(tmpdir(), 'db-renumber-')));
  repo = join(base, 'repo');
  mkdirSync(repo);
  git('init', '--quiet', '--initial-branch=main');
  addMigration(0, 'init', { clients: { id: 'uuid' } }, 1000);
  addMigration(1, 'sessions', { sessions: { id: 'uuid' } }, 2000);
  commit('chore(E001): base');
});
afterEach(() => rmSync(base, { recursive: true, force: true }));

/** The branch and main each add the given migrations on top of the base; the repository is left on the branch. */
const diverge = ({ main, own }) => {
  git('switch', '--quiet', '-c', 'feature');
  for (const args of own) addMigration(...args);
  commit('feat(F050): own');
  git('switch', '--quiet', 'main');
  for (const args of main) addMigration(...args);
  commit('feat(F020): main');
  git('switch', '--quiet', 'feature');
};

const files = () => readdirSync(join(repo, DIR)).sort();
const entries = () => readJson(`${DIR}/meta/_journal.json`).entries;
const tagsOf = (list) => list.map((entry) => entry.tag);
const tableNames = (path) => Object.keys(readJson(path).tables).sort();
const run = (...args) =>
  spawnSync('node', [SCRIPT, ...args], { encoding: 'utf8', cwd: repo, env: { ...gitEnv() } });

describe('#1273 checking for a number that main has used', () => {
  it('passes when the branch has no migration of its own', () => {
    git('switch', '--quiet', '-c', 'feature');
    assert.deepEqual(checkMigrations({ dir: repo, base: 'main' }), []);
  });

  it('passes for a branch whose migration comes after main’s last', () => {
    diverge({ main: [], own: [[2, 'own', { own: { id: 'uuid' } }, 3000]] });
    assert.deepEqual(checkMigrations({ dir: repo, base: 'main' }), []);
    assert.equal(run('check', '--base', 'main').status, 0);
  });

  it('fails when one migration of the branch has the number of one of main’s, and names the command', () => {
    diverge({
      main: [[2, 'main_table', { main: { id: 'uuid' } }, 2500]],
      own: [[2, 'own_table', { own: { id: 'uuid' } }, 3000]],
    });
    const problems = checkMigrations({ dir: repo, base: 'main' });
    assert.equal(problems.length, 1);
    assert.match(problems[0], /0002_own_table/);
    assert.match(problems[0], /main/);
    const result = run('check', '--base', 'main');
    assert.equal(result.status, 1);
    assert.match(result.stdout + result.stderr, /node scripts\/db-renumber\.mjs/);
  });

  it('fails when two migrations of the branch both clash', () => {
    diverge({
      main: [
        [2, 'main_table', { main: { id: 'uuid' } }, 2500],
        [3, 'main_more', { more: { id: 'uuid' } }, 2600],
      ],
      own: [
        [2, 'own_a', { a: { id: 'uuid' } }, 3000],
        [3, 'own_b', { b: { id: 'uuid' } }, 4000],
      ],
    });
    const problems = checkMigrations({ dir: repo, base: 'main' });
    assert.equal(problems.length, 2);
    assert.match(problems[0], /0002_own_a/);
    assert.match(problems[1], /0003_own_b/);
  });

  it('fails for a migration whose snapshot does not follow main’s last, even with a free number', () => {
    diverge({ main: [], own: [[2, 'own', { own: { id: 'uuid' } }, 3000]] });
    const path = `${DIR}/meta/0002_snapshot.json`;
    write(path, JSON.stringify({ ...readJson(path), prevId: uuid(999) }, null, 2));
    const problems = checkMigrations({ dir: repo, base: 'main' });
    assert.equal(problems.length, 1);
    assert.match(problems[0], /0002_own/);
    assert.match(problems[0], /prevId/);
  });

  it('fails when the base ref does not exist', () => {
    const result = run('check', '--base', 'origin/nothing');
    assert.equal(result.status, 1);
    assert.match(result.stdout + result.stderr, /origin\/nothing/);
  });

  it('passes when the repository has no migrations folder', () => {
    rmSync(join(repo, 'packages'), { recursive: true });
    commit('chore(E001): no migrations');
    assert.equal(run('check', '--base', 'main').status, 0);
  });
});

describe('#1273 renumbering the migrations of a branch', () => {
  it('does nothing when there is no clash', () => {
    diverge({ main: [], own: [[2, 'own', { own: { id: 'uuid' } }, 3000]] });
    const before = [files(), read(`${DIR}/meta/_journal.json`)];
    const result = renumberMigrations({ dir: repo, base: 'main' });
    assert.equal(result.renamed.length, 0);
    assert.deepEqual([files(), read(`${DIR}/meta/_journal.json`)], before);
  });

  it('moves one migration after main’s last: file, journal and snapshot chain, with the SQL unchanged', () => {
    diverge({
      main: [[2, 'main_table', { main: { id: 'uuid' } }, 2500]],
      own: [[2, 'own_table', { own: { id: 'uuid' } }, 2200]],
    });
    const sql = read(`${DIR}/0002_own_table.sql`);
    const ownSnapshot = readJson(`${DIR}/meta/0002_snapshot.json`);
    const result = renumberMigrations({ dir: repo, base: 'main' });
    assert.deepEqual(result.renamed, [{ from: '0002_own_table', to: '0003_own_table' }]);

    assert.equal(existsSync(join(repo, `${DIR}/0002_own_table.sql`)), false);
    assert.equal(read(`${DIR}/0003_own_table.sql`), sql);
    assert.deepEqual(tagsOf(entries()), [
      '0000_init',
      '0001_sessions',
      '0002_main_table',
      '0003_own_table',
    ]);
    assert.deepEqual(
      entries().map((entry) => entry.idx),
      [0, 1, 2, 3],
    );
    const moved = entries()[3];
    assert.ok(
      moved.when > entries()[2].when,
      'its time is after main’s, or a database that ran main’s skips it',
    );

    // The snapshot at the number main used is main's again (a merge of main brings the rest of its files); the snapshot of the
    // moved migration follows main's last.
    assert.equal(
      read(`${DIR}/meta/0002_snapshot.json`),
      git('show', `main:${DIR}/meta/0002_snapshot.json`),
    );
    const next = readJson(`${DIR}/meta/0003_snapshot.json`);
    assert.equal(next.prevId, readJson(`${DIR}/meta/0002_snapshot.json`).id);
    assert.equal(next.id, ownSnapshot.id);
    assert.deepEqual(tableNames(`${DIR}/meta/0003_snapshot.json`), [
      'public.clients',
      'public.main',
      'public.own',
      'public.sessions',
    ]);
    assert.deepEqual(checkMigrations({ dir: repo, base: 'main' }), []);
  });

  it('moves two migrations of the branch, in order, each snapshot chained to the one before', () => {
    diverge({
      main: [[2, 'main_table', { main: { id: 'uuid' } }, 2500]],
      own: [
        [2, 'own_a', { a: { id: 'uuid' } }, 3000],
        [3, 'own_b', { b: { id: 'uuid' } }, 4000],
      ],
    });
    const result = renumberMigrations({ dir: repo, base: 'main' });
    assert.deepEqual(result.renamed, [
      { from: '0002_own_a', to: '0003_own_a' },
      { from: '0003_own_b', to: '0004_own_b' },
    ]);
    assert.deepEqual(
      files().filter((f) => f.endsWith('.sql')),
      ['0000_init.sql', '0001_sessions.sql', '0003_own_a.sql', '0004_own_b.sql'],
    );
    assert.deepEqual(tagsOf(entries()).slice(2), ['0002_main_table', '0003_own_a', '0004_own_b']);
    const [s2, s3, s4] = [2, 3, 4].map((n) => readJson(`${DIR}/meta/${pad(n)}_snapshot.json`));
    assert.equal(s3.prevId, s2.id);
    assert.equal(s4.prevId, s3.id);
    assert.deepEqual(Object.keys(s3.tables).sort(), [
      'public.a',
      'public.clients',
      'public.main',
      'public.sessions',
    ]);
    assert.deepEqual(Object.keys(s4.tables).sort(), [
      'public.a',
      'public.b',
      'public.clients',
      'public.main',
      'public.sessions',
    ]);
    const whens = entries().map((entry) => entry.when);
    assert.deepEqual(
      whens,
      [...whens].sort((a, b) => a - b),
    );
    assert.deepEqual(checkMigrations({ dir: repo, base: 'main' }), []);
  });

  it('works in the middle of a merge of main, with the journal and snapshot in conflict', () => {
    diverge({
      main: [[2, 'main_table', { main: { id: 'uuid' } }, 2500]],
      own: [[2, 'own_table', { own: { id: 'uuid' } }, 3000]],
    });
    const merge = gitTry('merge', '--no-commit', '--no-ff', 'main');
    assert.notEqual(merge.status, 0, 'the merge conflicts in the journal and the 0002 snapshot');
    assert.match(read(`${DIR}/meta/_journal.json`), /<<<<<<</);

    const result = renumberMigrations({ dir: repo, base: 'main' });
    assert.deepEqual(result.renamed, [{ from: '0002_own_table', to: '0003_own_table' }]);
    assert.deepEqual(tagsOf(entries()), [
      '0000_init',
      '0001_sessions',
      '0002_main_table',
      '0003_own_table',
    ]);
    assert.equal(
      read(`${DIR}/meta/0002_snapshot.json`),
      git('show', `main:${DIR}/meta/0002_snapshot.json`),
    );
    assert.deepEqual(tableNames(`${DIR}/meta/0003_snapshot.json`), [
      'public.clients',
      'public.main',
      'public.own',
      'public.sessions',
    ]);
    assert.ok(existsSync(join(repo, `${DIR}/0002_main_table.sql`)));
    assert.deepEqual(checkMigrations({ dir: repo, base: 'main' }), []);
  });

  it('is done by the command, which says what it moved, and a second run changes nothing', () => {
    diverge({
      main: [[2, 'main_table', { main: { id: 'uuid' } }, 2500]],
      own: [[2, 'own_table', { own: { id: 'uuid' } }, 3000]],
    });
    const first = run('--base', 'main');
    assert.equal(first.status, 0, first.stderr);
    assert.match(first.stdout, /0002_own_table → 0003_own_table/);
    const journal = read(`${DIR}/meta/_journal.json`);
    const second = run('--base', 'main');
    assert.equal(second.status, 0);
    assert.match(second.stdout, /nothing to renumber/i);
    assert.equal(read(`${DIR}/meta/_journal.json`), journal);
  });

  it('refuses, and changes nothing, when main and the branch changed the same column differently', () => {
    diverge({
      main: [[2, 'shared_main', { shared: { id: 'uuid', note: 'text' } }, 2500]],
      own: [[2, 'shared_own', { shared: { id: 'uuid', note: 'integer' } }, 3000]],
    });
    const before = [files(), read(`${DIR}/meta/_journal.json`)];
    assert.throws(() => renumberMigrations({ dir: repo, base: 'main' }), /public\.shared/);
    assert.deepEqual([files(), read(`${DIR}/meta/_journal.json`)], before);
    const result = run('--base', 'main');
    assert.equal(result.status, 1);
    assert.match(result.stderr, /shared/);
  });

  it('refuses when the snapshot of a clashing migration was replaced by main’s in a merge', () => {
    diverge({
      main: [[2, 'main_table', { main: { id: 'uuid' } }, 2500]],
      own: [[2, 'own_table', { own: { id: 'uuid' } }, 3000]],
    });
    gitTry('merge', '--no-commit', '--no-ff', 'main');
    git('checkout', '--theirs', '--', `${DIR}/meta/0002_snapshot.json`);
    git('checkout', '--ours', '--', `${DIR}/meta/_journal.json`);
    git('add', '-A');
    git('commit', '--quiet', '-m', 'Merge main');
    assert.throws(() => renumberMigrations({ dir: repo, base: 'main' }), /snapshot/i);
  });

  describe('a database that may have run the migration', () => {
    const fakePsql = (rows) => {
      const bin = join(base, 'bin');
      mkdirSync(bin, { recursive: true });
      writeFileSync(
        join(bin, 'psql'),
        `#!/bin/sh\nprintf '%s\\n' ${rows.map((row) => `'${row}'`).join(' ')}\n`,
      );
      chmodSync(join(bin, 'psql'), 0o755);
      return { ...gitEnv(), PATH: `${bin}:${process.env.PATH}` };
    };
    const clash = () =>
      diverge({
        main: [[2, 'main_table', { main: { id: 'uuid' } }, 2500]],
        own: [[2, 'own_table', { own: { id: 'uuid' } }, 3000]],
      });

    it('refuses when the database has the migration’s time in its history', () => {
      clash();
      const result = spawnSync(
        'node',
        [SCRIPT, '--base', 'main', '--database-url', 'postgres://preview.invalid/db'],
        {
          encoding: 'utf8',
          cwd: repo,
          env: fakePsql(['1000', '2000', '3000']),
        },
      );
      assert.equal(result.status, 1);
      assert.match(result.stderr, /0002_own_table/);
      assert.match(result.stderr, /already (been )?applied/i);
      assert.equal(
        existsSync(join(repo, `${DIR}/0002_own_table.sql`)),
        true,
        'nothing was renamed',
      );
    });

    it('renumbers when the database has only the migrations main has', () => {
      clash();
      const result = spawnSync(
        'node',
        [SCRIPT, '--base', 'main', '--database-url', 'postgres://preview.invalid/db'],
        {
          encoding: 'utf8',
          cwd: repo,
          env: fakePsql(['1000', '2000']),
        },
      );
      assert.equal(result.status, 0, result.stderr);
      assert.equal(existsSync(join(repo, `${DIR}/0003_own_table.sql`)), true);
    });

    it('refuses when the database cannot be read, since it cannot say the migration is not applied', () => {
      clash();
      const bin = join(base, 'bin');
      mkdirSync(bin, { recursive: true });
      writeFileSync(join(bin, 'psql'), '#!/bin/sh\necho "connection refused" >&2\nexit 2\n');
      chmodSync(join(bin, 'psql'), 0o755);
      const result = spawnSync(
        'node',
        [SCRIPT, '--base', 'main', '--database-url', 'postgres://preview.invalid/db'],
        {
          encoding: 'utf8',
          cwd: repo,
          env: { ...gitEnv(), PATH: `${bin}:${process.env.PATH}` },
        },
      );
      assert.equal(result.status, 1);
      assert.match(result.stderr, /connection refused/);
      assert.equal(
        existsSync(join(repo, `${DIR}/0002_own_table.sql`)),
        true,
        'nothing was renamed',
      );
    });

    it('says that no database was checked, and that the PR’s own preview database is not one of them', () => {
      clash();
      const result = run('--base', 'main');
      assert.match(result.stdout, /database: not checked/);
      assert.match(result.stdout, /preview database is not checked/);
      assert.doesNotMatch(result.stdout, /preview url/i);
    });
  });
});
