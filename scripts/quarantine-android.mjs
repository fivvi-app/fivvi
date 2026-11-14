#!/usr/bin/env node
// The readers of the Android quarantine lists (E002 #1363, ADR-025 amendment of 12 November 2026, TESTING.md §8):
// quarantine/compose.txt (the Android unit tests and the Compose UI tests) and quarantine/maestro.txt (the Maestro flows).
// scripts/android.sh and scripts/maestro.sh call the command below; scripts/quarantine.mjs (the rule) calls markerProblems.
//
// How an entry names a test:
//   compose  `app.fivvi.pro.home.WorkspaceSwitchTest#test_F012_AC6_profileSwitchesWorkspace`: the full class name, `#`, the
//            method, as JUnit and the instrumentation runner print it. A class alone lists every test of it. The class is
//            found as <module>/src/test|androidTest/kotlin/<package path>/<Class>.kt under apps/android.
//   maestro  `workspace-switch`: the name of a flow file of e2e/maestro without `.yaml`. It covers both locales.
//
// The markers of the tests that are never quarantined (tenant isolation, concurrency, permission) are read from the source,
// where the name cannot carry them: a Kotlin test has the annotation @Isolation, @Concurrency or @Permission (on the
// method, or on the class for all its tests; app.fivvi.core.quarantine in :core's testShared), a Maestro flow has the tag
// `isolation`, `concurrency` or `permission` in the `tags:` of its header.
//
//   node scripts/quarantine-android.mjs count <compose|maestro>   the number of entries of a list
//   node scripts/quarantine-android.mjs tests                     every listed Compose test, comma separated (for Gradle)
//   node scripts/quarantine-android.mjs ui                        the listed Compose UI tests, comma separated
//   node scripts/quarantine-android.mjs ui-modules                the modules that have a listed UI test, one per line
//   node scripts/quarantine-android.mjs flows                     the flow files to run, one per line: all but the listed
//                                                                 ones, or only them with FIVVI_QUARANTINE=only
// An entry that names no test is a warning in a required job (the list stays harmless) and an error with
// FIVVI_QUARANTINE=only (the Quarantine job must run what it says it runs). FIVVI_QUARANTINE_ROOT points the command at
// another checkout (the tests).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ANDROID_LISTS = ['compose', 'maestro'];

const defaultRoot = () => join(import.meta.dirname, '..');
const ANDROID = 'apps/android';
const FLOWS = 'e2e/maestro';

/** The tests of the list of `runner`, as written, in order. A list that does not exist has none. */
export const listedTests = (runner, { root = defaultRoot() } = {}) => {
  const file = join(root, 'quarantine', `${runner}.txt`);
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'))
    .map((line) => line.split('|')[0].trim());
};

/** 'only' in the Quarantine job (FIVVI_QUARANTINE=only), 'exclude' everywhere else. */
export const quarantineMode = (env = process.env) => {
  const value = env.FIVVI_QUARANTINE ?? '';
  if (value === '') return 'exclude';
  if (value === 'only') return 'only';
  throw new Error(`FIVVI_QUARANTINE must be "only" or not set, not "${value}"`);
};

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const capitalised = (marker) => marker.slice(1).replace(/^./, (c) => c.toUpperCase());

const modulesOf = (root) => {
  const dir = join(root, ANDROID);
  return existsSync(dir)
    ? readdirSync(dir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && existsSync(join(dir, entry.name, 'src')))
        .map((entry) => entry.name)
        .sort()
    : [];
};

/** The source of a Compose entry: {module, kind: 'unit' | 'ui', file}, or null when it names no test. */
export const composeTarget = (test, { root = defaultRoot() } = {}) => {
  const [className, method] = test.split('#');
  const dot = className.lastIndexOf('.');
  if (dot < 1) return null;
  const path = `${className.slice(0, dot).replaceAll('.', '/')}/${className.slice(dot + 1)}.kt`;
  for (const module of modulesOf(root)) {
    for (const [dir, kind] of [
      ['test', 'unit'],
      ['androidTest', 'ui'],
    ]) {
      const file = `${ANDROID}/${module}/src/${dir}/kotlin/${path}`;
      if (!existsSync(join(root, file))) continue;
      if (
        method !== undefined &&
        !new RegExp(`\\bfun\\s+\`?${escapeRegExp(method)}\`?\\s*\\(`).test(
          readFileSync(join(root, file), 'utf8'),
        )
      )
        return null;
      return { module, kind, file };
    }
  }
  return null;
};

/** The simple name of every annotation in `text`: `@Isolation` and `@app.fivvi.core.quarantine.Isolation` are both Isolation. */
const annotationNames = (text) => [...text.matchAll(/@(?:\w+\.)*(\w+)/g)].map((m) => m[1]);

/**
 * The names of the annotations of the declaration at `index`: those on the line itself before the keyword, and those on the
 * lines directly above, also above an annotation whose arguments run over several lines (`@Test(` ... `)`).
 */
const annotationsAt = (lines, index) => {
  const names = [];
  const same = lines[index].match(/^\s*((?:@[\w.]+(?:\([^)]*\))?\s+)*)/)?.[1] ?? '';
  names.push(...annotationNames(same));
  // Walking up, `depth` is the number of closing brackets not yet matched by an opening one: inside the arguments of an
  // annotation (depth > 0) a line is part of it, and the annotation starts on the line that closes the count.
  let depth = 0;
  for (let i = index - 1; i >= 0; i--) {
    const line = lines[i].trim();
    const balance = (line.match(/\)/g) ?? []).length - (line.match(/\(/g) ?? []).length;
    if (depth === 0 && !line.startsWith('@') && balance <= 0) break;
    depth = Math.max(0, depth + balance);
    if (depth === 0 && line.startsWith('@')) names.push(...annotationNames(line));
  }
  return names;
};

/** The markers (like '@isolation') of a Compose test: its method's annotations, and its class's. */
const composeMarkers = (test, { root, markers }) => {
  const target = composeTarget(test, { root });
  if (!target) return [];
  const [className, method] = test.split('#');
  const lines = readFileSync(join(root, target.file), 'utf8').split('\n');
  const found = new Set();
  const read = (index) => {
    const names = annotationsAt(lines, index);
    for (const marker of markers) if (names.includes(capitalised(marker))) found.add(marker);
  };
  const classIndex = lines.findIndex((line) =>
    new RegExp(
      `\\bclass\\s+${escapeRegExp(className.slice(className.lastIndexOf('.') + 1))}\\b`,
    ).test(line),
  );
  if (classIndex >= 0) read(classIndex);
  // A class alone names all its tests: every method counts.
  lines.forEach((line, i) => {
    const fun = line.match(/\bfun\s+`?([^`(\s]+)`?\s*\(/);
    if (fun && (method === undefined || fun[1] === method)) read(i);
  });
  return markers.filter((marker) => found.has(marker));
};

const flowFile = (name, root) =>
  /^[\w-]+$/.test(name) && name !== 'config' && existsSync(join(root, FLOWS, `${name}.yaml`))
    ? `${FLOWS}/${name}.yaml`
    : null;

/** The tags of a flow's header (everything before the `---` line), as a list or inline. */
const flowTags = (file) => {
  const header = readFileSync(file, 'utf8').split(/^---\s*$/m)[0];
  const inline = header.match(/^tags:\s*\[(.*)\]\s*$/m)?.[1];
  if (inline !== undefined)
    return inline.split(',').map((tag) => tag.trim().replace(/^["']|["']$/g, ''));
  const block = header.match(/^tags:\s*\n((?:[ \t]+-[ \t]*.+\n?)+)/m)?.[1] ?? '';
  return [...block.matchAll(/-[ \t]*["']?([^"'\s#]+)/g)].map((m) => m[1]);
};

const maestroMarkers = (test, { root, markers }) => {
  const file = flowFile(test, root);
  if (!file) return [];
  const tags = flowTags(join(root, file));
  return markers.filter((marker) => tags.includes(marker.slice(1)));
};

/**
 * The problems of a Compose or Maestro entry with a marker of a test that is never quarantined (`markers` are the rule's,
 * '@isolation' and the like). An entry that names no test has none: nothing is left out for it.
 */
export const markerProblems = (runner, test, { root = defaultRoot(), markers }) => {
  const found =
    runner === 'compose'
      ? composeMarkers(test, { root, markers })
      : runner === 'maestro'
        ? maestroMarkers(test, { root, markers })
        : [];
  return found.length === 0
    ? []
    : [
        `the test is marked ${found.join(', ')}: tenant isolation, concurrency and permission tests are never quarantined; fix the test or revert the change that broke it`,
      ];
};

/** The flow files to run: `exclude` all but the listed flows, `only` the listed flows; `missing` are listed names with no flow. */
export const flowTargets = (
  mode,
  { root = defaultRoot(), tests = listedTests('maestro', { root }) } = {},
) => {
  const listed = new Map();
  const missing = [];
  for (const test of tests) {
    const file = flowFile(test, root);
    if (file) listed.set(file, test);
    else missing.push(test);
  }
  const all = existsSync(join(root, FLOWS))
    ? readdirSync(join(root, FLOWS))
        .filter((name) => name.endsWith('.yaml') && flowFile(name.slice(0, -'.yaml'.length), root))
        .sort()
        .map((name) => `${FLOWS}/${name}`)
    : [];
  return {
    flows: all.filter((file) => (mode === 'only' ? listed.has(file) : !listed.has(file))),
    missing,
  };
};

const fail = (message, status = 2) => {
  console.error(`quarantine-android: ${message}`);
  process.exit(status);
};

function main() {
  const root = process.env.FIVVI_QUARANTINE_ROOT || defaultRoot();
  let mode;
  try {
    mode = quarantineMode();
  } catch (error) {
    fail(error.message);
  }
  const [command, arg] = process.argv.slice(2);
  // An entry that names no test: an error for the Quarantine job, a warning for a required job.
  const unknown = (what, names, where) => {
    for (const name of names) {
      const message = `${name} is no ${what} in ${where} (quarantine/${what === 'flow' ? 'maestro' : 'compose'}.txt)`;
      if (mode === 'only') {
        console.error(`quarantine-android: ${message}`);
        process.exitCode = 1;
      } else console.error(`quarantine-android: warning: ${message}; nothing is left out for it`);
    }
  };
  const compose = () => {
    const entries = listedTests('compose', { root }).map((test) => ({
      test,
      target: composeTarget(test, { root }),
    }));
    unknown(
      'test',
      entries.filter((e) => !e.target).map((e) => e.test),
      `${ANDROID}/*/src/{test,androidTest}`,
    );
    return entries.filter((e) => e.target);
  };
  switch (command) {
    case 'count':
      if (!ANDROID_LISTS.includes(arg)) fail(`count needs a list: ${ANDROID_LISTS.join(', ')}`);
      console.log(listedTests(arg, { root }).length);
      return;
    case 'tests':
      console.log(
        compose()
          .map((e) => e.test)
          .join(','),
      );
      return;
    case 'ui':
      console.log(
        compose()
          .filter((e) => e.target.kind === 'ui')
          .map((e) => e.test)
          .join(','),
      );
      return;
    case 'ui-modules': {
      const modules = [
        ...new Set(
          compose()
            .filter((e) => e.target.kind === 'ui')
            .map((e) => e.target.module),
        ),
      ].sort();
      if (modules.length > 0) console.log(modules.join('\n'));
      return;
    }
    case 'flows': {
      const { flows, missing } = flowTargets(mode, { root });
      unknown('flow', missing, FLOWS);
      if (flows.length > 0) console.log(flows.join('\n'));
      return;
    }
    default:
      fail(
        'usage: quarantine-android.mjs count <compose|maestro> | tests | ui | ui-modules | flows',
      );
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
