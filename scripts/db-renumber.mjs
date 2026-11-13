#!/usr/bin/env node
// Two PRs that each add a database migration take the same number (E001 #1273). Drizzle numbers the files in sequence
// (`0024_name.sql`), lists them in `meta/_journal.json` and chains the snapshots (`meta/0024_snapshot.json`, `prevId`),
// so the second PR to merge has to move its migrations after main's last one. This does it, so nobody renames
// migration files, journal tags or snapshot ids by hand.
//
//   node scripts/db-renumber.mjs check [--base <ref>]
//       Fails (exit 1, one line per problem) when a migration of this branch has a number that main already uses, or
//       when its snapshot does not follow main's last one. scripts/check.sh runs it, so it fails before the PR is pushed.
//   node scripts/db-renumber.mjs [renumber] [--base <ref>] [--database-url <url>]
//       Moves the branch's own migrations after main's last: renames the SQL files (the SQL itself is not touched),
//       rewrites the journal (main's entries, then the branch's, with a `when` after main's last so a database that ran
//       main's migration still runs these) and the snapshots: each snapshot of the branch is merged onto main's last
//       snapshot (a three-way merge of the JSON against the snapshot the branch started from) and chained to it
//       (`prevId`), so the next `pnpm db:generate` finds no difference. Does nothing when there is no clash.
//       It refuses, and changes nothing, when the branch and main changed the same part of the schema differently, and
//       when `--database-url` is given and that database has the branch's migration in its history (psql must be
//       installed): a migration that has run somewhere cannot be renumbered, fix that database or make a new migration.
//
// Main is `--base` (default `origin/main`), read from git, so it works before and in the middle of a merge of main, and
// after one. The branch's own migrations are the SQL files in the working tree that main doesn't have; during a merge
// that left a conflict, the branch's side of the journal and snapshots is read from the index. Stage the result with
// `git add packages/database/migrations`.
import { execFileSync, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

export const MIGRATIONS = 'packages/database/migrations';
const COMMAND = 'node scripts/db-renumber.mjs';
const NO_PARENT = '00000000-0000-0000-0000-000000000000';

const git = (dir, args) =>
  execFileSync('git', ['-C', dir, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 256 * 1024 * 1024,
  });

/** The file at `path` in `ref`, or null when it isn't there. */
const show = (dir, ref, path) => {
  const result = spawnSync('git', ['-C', dir, 'show', `${ref}:${path}`], {
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });
  return result.status === 0 ? result.stdout : null;
};

const numberOf = (name) => {
  const match = /^(\d+)_/.exec(name);
  return match ? Number(match[1]) : null;
};
const pad = (n) => String(n).padStart(4, '0');
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

/** What `dir` (a checkout) holds of migrations, and what `base` has: everything the check and the renumbering decide on. */
const load = (dir, base, migrations) => {
  if (
    spawnSync('git', ['-C', dir, 'rev-parse', '--verify', '--quiet', `${base}^{commit}`]).status !==
    0
  )
    throw new Error(
      `the base ref "${base}" does not exist: fetch it (git fetch origin main) or pass --base`,
    );
  const folder = join(dir, migrations);
  if (!existsSync(folder)) return null;

  const mainFiles = git(dir, ['ls-tree', '-r', '--name-only', base, '--', migrations])
    .split('\n')
    .filter(Boolean);
  const mainNames = new Set(
    mainFiles.filter((f) => f.endsWith('.sql')).map((f) => f.split('/').pop()),
  );
  const journalPath = `${migrations}/meta/_journal.json`;
  const mainJournalText = show(dir, base, journalPath);
  const mainJournal = mainJournalText
    ? JSON.parse(mainJournalText)
    : { version: '7', dialect: 'postgresql', entries: [] };
  const mainTags = mainJournal.entries.map((entry) => entry.tag);
  const mainLast = mainJournal.entries.at(-1) ?? null;
  const mainMax = Math.max(-1, ...mainTags.map(numberOf).filter((n) => n !== null));

  const own = readdirSync(folder)
    .filter((name) => name.endsWith('.sql') && !mainNames.has(name))
    .sort()
    .map((name) => ({ tag: name.slice(0, -4), number: numberOf(name) }));

  /** A file of the branch: the working tree's, or our side in the index when a merge left the file in conflict. */
  const readOwn = (path) => {
    const full = join(dir, path);
    const text = existsSync(full) ? readFileSync(full, 'utf8') : null;
    if (
      (text === null || text.includes('<<<<<<<')) &&
      git(dir, ['ls-files', '-u', '--', path]).trim()
    )
      return show(dir, ':2', path);
    return text;
  };

  return {
    dir,
    base,
    migrations,
    folder,
    mainFiles,
    mainNames,
    mainJournal,
    mainLast,
    mainMax,
    own,
    readOwn,
    journalPath,
  };
};

const snapshotPath = (ctx, number) => `${ctx.migrations}/meta/${pad(number)}_snapshot.json`;

/** The problems of the branch's migrations, one line each. */
const problemsOf = (ctx) => {
  const problems = [];
  if (ctx.own.length === 0) return problems;
  let journal = null;
  try {
    journal = JSON.parse(ctx.readOwn(ctx.journalPath) ?? 'null');
  } catch {
    problems.push(`${ctx.journalPath} is not valid JSON (a merge conflict in it?)`);
  }
  let previousId = null;
  if (ctx.mainLast) {
    const text = show(ctx.dir, ctx.base, snapshotPath(ctx, numberOf(ctx.mainLast.tag)));
    previousId = text ? JSON.parse(text).id : null;
  } else previousId = NO_PARENT;
  for (const migration of ctx.own) {
    if (migration.number !== null && migration.number <= ctx.mainMax) {
      const taken = ctx.mainJournal.entries.find(
        (entry) => numberOf(entry.tag) === migration.number,
      );
      problems.push(
        `migration ${migration.tag} has the number ${pad(migration.number)}, which main already uses${
          taken ? ` (${taken.tag})` : ''
        }; main's last is ${ctx.mainLast.tag}`,
      );
      previousId = null; // its snapshot follows the snapshot it clashes with: one problem is enough
    }
    if (journal && !journal.entries?.some((entry) => entry.tag === migration.tag))
      problems.push(`migration ${migration.tag} is not in the journal`);
    const text =
      migration.number === null ? null : ctx.readOwn(snapshotPath(ctx, migration.number));
    if (text === null) {
      problems.push(`migration ${migration.tag} has no snapshot`);
      previousId = null;
      continue;
    }
    let snapshot;
    try {
      snapshot = JSON.parse(text);
    } catch {
      problems.push(`the snapshot of ${migration.tag} is not valid JSON (a merge conflict in it?)`);
      previousId = null;
      continue;
    }
    if (previousId !== null && snapshot.prevId !== previousId)
      problems.push(
        `the snapshot of ${migration.tag} does not follow the previous snapshot (its prevId is not ${previousId})`,
      );
    previousId = snapshot.id;
  }
  return problems;
};

/** The problems with the migrations of the branch in `dir`, compared with `base`: [] when there are none. */
export const checkMigrations = ({ dir, base = 'origin/main', migrations = MIGRATIONS }) => {
  const ctx = load(dir, base, migrations);
  return ctx ? problemsOf(ctx) : [];
};

/**
 * Three-way merge of two JSON values: what `own` changed from `base`, applied to `main`. Objects are merged by key;
 * the same value changed differently on both sides (or an array changed on both) is a conflict.
 */
const merge3 = (base, own, main, path) => {
  if (isDeepStrictEqual(own, base)) return main;
  if (isDeepStrictEqual(main, base)) return own;
  if (isDeepStrictEqual(own, main)) return own;
  if (isObject(own) && isObject(main) && (base === undefined || isObject(base))) {
    const out = {};
    for (const key of [...Object.keys(main), ...Object.keys(own).filter((k) => !(k in main))]) {
      const merged = merge3(base?.[key], own[key], main[key], `${path}.${key}`);
      if (merged !== undefined) out[key] = merged;
    }
    return out;
  }
  throw new Error(
    `main and this branch changed ${path} differently: renumbering cannot merge that. Regenerate the migration (delete it, run pnpm db:generate) instead`,
  );
};

const withoutIds = ({ id: _id, prevId: _prevId, ...rest }) => rest;

/** The database's history: the `when` of every migration it ran (drizzle's created_at), read with psql. */
const appliedWhens = (url) => {
  const result = spawnSync(
    'psql',
    [url, '-At', '-c', 'select created_at from drizzle.__drizzle_migrations'],
    {
      encoding: 'utf8',
    },
  );
  if (result.error || result.status !== 0)
    throw new Error(
      `could not read the migration history of the database (${result.error?.message ?? result.stderr.trim()}): it cannot be said that the migration is not applied there, so nothing was renamed`,
    );
  return new Set(
    result.stdout
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map(Number),
  );
};

/**
 * Moves the branch's migrations after main's last. Returns what it renamed ([] when there was nothing to do) and notes
 * for the person running it. Throws, having changed nothing, when it cannot.
 */
export const renumberMigrations = ({
  dir,
  base = 'origin/main',
  migrations = MIGRATIONS,
  databaseUrl,
}) => {
  const ctx = load(dir, base, migrations);
  if (!ctx || problemsOf(ctx).length === 0) return { renamed: [], notes: [] };

  const ownJournalText = ctx.readOwn(ctx.journalPath);
  let ownJournal;
  try {
    ownJournal = JSON.parse(ownJournalText ?? 'null');
  } catch {
    throw new Error(`${ctx.journalPath} of the branch is not valid JSON`);
  }
  if (!ownJournal) throw new Error(`${ctx.journalPath} is missing`);

  const mainSnapshotText = (number) => show(dir, base, snapshotPath(ctx, number));
  const own = ctx.own.map((migration) => {
    const entry = ownJournal.entries.find((candidate) => candidate.tag === migration.tag);
    if (!entry) throw new Error(`migration ${migration.tag} is not in the journal`);
    if (migration.number === null) throw new Error(`migration ${migration.tag} has no number`);
    const text = ctx.readOwn(snapshotPath(ctx, migration.number));
    if (text === null) throw new Error(`migration ${migration.tag} has no snapshot`);
    const snapshot = JSON.parse(text);
    const mainText = mainSnapshotText(migration.number);
    if (mainText !== null && JSON.parse(mainText).id === snapshot.id)
      throw new Error(
        `the snapshot ${pad(migration.number)}_snapshot.json is main's, not the one of ${migration.tag} (a merge took main's side): restore the branch's version from before the merge (git show <branch commit>:${snapshotPath(ctx, migration.number)}) and run this again`,
      );
    return {
      ...migration,
      entry,
      snapshot,
      sql: readFileSync(join(ctx.folder, `${migration.tag}.sql`)),
    };
  });

  const notes = [];
  if (databaseUrl) {
    const applied = appliedWhens(databaseUrl);
    const already = own
      .filter((migration) => applied.has(migration.entry.when))
      .map((migration) => migration.tag);
    if (already.length)
      throw new Error(
        `${already.join(', ')} has already been applied to the database, so it cannot be renumbered: a database that ran it would skip main's migration or run it twice. Fix that database first, or drop the migration and make a new one`,
      );
    notes.push('database: the migration history has none of these migrations.');
  } else
    notes.push(
      'database: not checked. A migration that already ran in a preview or other database cannot be renumbered; pass --database-url <url> to check one (needs psql).',
    );

  // The snapshots: the branch's changes applied onto main's last snapshot, one step at a time.
  let previous = null;
  let previousOwn = null;
  const first = own[0].snapshot;
  const mainLastSnapshot = ctx.mainLast ? mainSnapshotText(numberOf(ctx.mainLast.tag)) : null;
  const main = mainLastSnapshot ? JSON.parse(mainLastSnapshot) : null;
  let baseSnapshot = null;
  if (main) {
    for (const file of ctx.mainFiles
      .filter((f) => f.endsWith('_snapshot.json'))
      .sort()
      .reverse()) {
      const candidate = JSON.parse(show(dir, base, file));
      if (candidate.id === first.prevId) {
        baseSnapshot = candidate;
        break;
      }
    }
    if (!baseSnapshot)
      throw new Error(
        `the snapshot ${first.prevId} that ${own[0].tag} started from is not in ${base}: nothing to merge it onto`,
      );
  }
  const moved = own.map((migration, index) => {
    const number = ctx.mainMax + 1 + index;
    const parent = previous ?? main;
    let snapshot;
    if (parent) {
      const merged = merge3(
        withoutIds(previousOwn ?? baseSnapshot),
        withoutIds(migration.snapshot),
        withoutIds(parent),
        'the snapshot',
      );
      snapshot = { id: migration.snapshot.id, prevId: parent.id, ...merged };
    } else snapshot = { ...migration.snapshot, prevId: NO_PARENT };
    previous = snapshot;
    previousOwn = migration.snapshot;
    return {
      ...migration,
      newNumber: number,
      newTag: `${pad(number)}_${migration.tag.replace(/^\d+_/, '')}`,
      newSnapshot: snapshot,
    };
  });

  // The journal: main's entries, then the branch's, each with a time after the one before it.
  let when = ctx.mainLast ? ctx.mainLast.when : 0;
  const entries = [...ctx.mainJournal.entries];
  for (const migration of moved) {
    when = Math.max(migration.entry.when, when + 1);
    entries.push({ ...migration.entry, idx: migration.newNumber, tag: migration.newTag, when });
  }
  const journal = { ...ctx.mainJournal, entries };

  // Nothing has been written until here. Take the old files away (main's own snapshot at a number the branch used is
  // put back as main has it), then write the new ones.
  for (const migration of own) {
    rmSync(join(ctx.folder, `${migration.tag}.sql`));
    const old = join(dir, snapshotPath(ctx, migration.number));
    const mainText = mainSnapshotText(migration.number);
    if (mainText !== null) writeFileSync(old, mainText);
    else rmSync(old, { force: true });
  }
  for (const migration of moved) {
    writeFileSync(join(ctx.folder, `${migration.newTag}.sql`), migration.sql);
    writeFileSync(
      join(dir, snapshotPath(ctx, migration.newNumber)),
      JSON.stringify(migration.newSnapshot, null, 2),
    );
  }
  mkdirSync(dirname(join(dir, ctx.journalPath)), { recursive: true });
  writeFileSync(join(dir, ctx.journalPath), JSON.stringify(journal, null, 2));

  return {
    renamed: moved.map((m) => ({ from: m.tag, to: m.newTag })),
    notes,
    mainLast: ctx.mainLast?.tag ?? null,
  };
};

const usage = () => {
  console.error(
    `usage: ${COMMAND} check [--base <ref>]\n       ${COMMAND} [renumber] [--base <ref>] [--database-url <url>]`,
  );
  process.exit(2);
};

const run = () => {
  const args = process.argv.slice(2);
  const command = args[0] && !args[0].startsWith('--') ? args.shift() : 'renumber';
  if (!['check', 'renumber'].includes(command)) usage();
  const options = { base: 'origin/main' };
  while (args.length) {
    const flag = args.shift();
    if (flag === '--base' && args.length) options.base = args.shift();
    else if (flag === '--database-url' && args.length && command === 'renumber')
      options.databaseUrl = args.shift();
    else usage();
  }
  try {
    const dir = git(process.cwd(), ['rev-parse', '--show-toplevel']).trim();
    if (command === 'check') {
      const problems = checkMigrations({ dir, base: options.base });
      if (problems.length === 0) return;
      for (const problem of problems) console.log(problem);
      console.log(
        `Merge ${options.base} into the branch, then run \`${COMMAND}\`: it moves the branch's migrations after main's last, the journal and snapshots with them. Don't rename them by hand.`,
      );
      process.exit(1);
    }
    const result = renumberMigrations({ dir, ...options });
    if (result.renamed.length === 0) {
      console.log("nothing to renumber: the migrations of this branch come after main's last.");
      return;
    }
    for (const { from, to } of result.renamed) console.log(`${from} → ${to}`);
    console.log(
      `Moved ${result.renamed.length} migration(s) after ${result.mainLast ?? 'main'}; the SQL is unchanged. Next: git add ${MIGRATIONS}, run pnpm test in packages/database (the schema and the snapshots must agree), commit.`,
    );
    for (const note of result.notes) console.log(note);
  } catch (error) {
    console.error(`error: ${error.message}`);
    process.exit(1);
  }
};

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) run();
