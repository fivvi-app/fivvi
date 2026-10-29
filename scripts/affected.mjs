// What a change can affect (#293, ADR-024): the one place that maps changed paths to the checks and CI jobs that must
// run. scripts/check.sh and the "Detect changes" job of .github/workflows/ci.yml both call it, so the decision is
// tested (scripts/test/affected.test.mjs) and cannot drift between the two. Plain JavaScript with no dependencies:
// "Detect changes" runs it before any install, on whatever Node the runner has.
//
//   node scripts/affected.mjs [--force] [--all] [--json]
//       reads the changed paths on stdin (git diff --name-only) and prints, as key=value lines (the format of
//       $GITHUB_OUTPUT) or, with --json, as one JSON object:
//         all          true when the workspace setup changed or the run is forced: everything is affected
//         root         true when the root scripts and their shellcheck must run (scripts, hooks, agent definitions,
//                      CI, the native apps' files the root tests read, a Markdown file a root test reads)
//         docs         true when the change is Markdown only: only the hygiene checks (doc links) run
//         packages     the affected packages (changed ones and everything that depends on them), comma-separated
//         integration  the affected packages that have integration tests
//         e2e          true when the web app is affected (it, or a package it depends on, changed)
//       and the reason for every decision on stderr ("e2e: skipped, no web change").
//       --force (and --all) affects everything: workflow_dispatch and the run-native label (AC12), check.sh --all.
//
// The packages are read from the workspace (pnpm-workspace.yaml and each package.json) of the repository this script
// sits in, so the dependency graph is never a second copy to keep up to date.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = '@fivvi/web';

// A change to any of these affects every package (US4): what the whole workspace is installed, built and linted by.
// It is turbo's own globalDependencies (turbo.json) plus the lockfile, the workspace files and the shared test preset.
const WORKSPACE_SETUP = [
  /^pnpm-lock\.yaml$/,
  /^pnpm-workspace\.yaml$/,
  /^package\.json$/,
  /^turbo\.json$/,
  /^tsconfig\.base\.json$/,
  /^biome\.json$/,
  /^\.nvmrc$/,
  /^\.npmrc$/,
  /^\.gitignore$/,
  /^packages\/testing\/src\/vitest\.ts$/,
];

// Markdown that is not documentation only: root tests read it (agent rules, the READMEs whose app IDs are checked, the
// registry, the engineering and agent docs, skills and agent definitions). Every other .md file only has its links
// checked.
const MARKDOWN_READ_BY_TESTS = [
  /^(AGENTS|CLAUDE)\.md$/,
  /^apps\/(ios|android)\/README\.md$/,
  /^docs\/(agents|engineering)\//,
  /^docs\/product\/FEATURES\.md$/,
  /^packages\/i18n\/GLOSSARY\.md$/,
  /^\.(agents|claude|github|codex)\//,
  /^scripts\//,
];

// Root files that are the input of a package's tests: the package is affected when one changes, and so is everything that
// depends on it. compose.yaml is the Postgres image the integration and e2e tests run against (CI's service containers
// use the same one, which a root test checks): a new version must run them again, not reuse a cached result. It also
// affects the root tests, which compare the two.
const INPUT_OF_PACKAGE = new Map([['compose.yaml', '@fivvi/database']]);

const isMarkdown = (path) => /\.md$/.test(path);

/** The packages of the workspace at `root`: [{name, dir, scripts, dependencies}], from pnpm-workspace.yaml. */
export function readWorkspace(root) {
  const yaml = readFileSync(join(root, 'pnpm-workspace.yaml'), 'utf8');
  const lines = yaml.split('\n');
  const globs = [];
  for (const line of lines.slice(lines.indexOf('packages:') + 1)) {
    if (/^\S/.test(line)) break;
    const match = line.match(/^\s+-\s+['"]?([^'"#\s]+)['"]?/);
    if (match) globs.push(match[1]);
  }
  const dirs = new Set();
  for (const glob of globs) {
    if (glob.endsWith('/*')) {
      const parent = glob.slice(0, -2);
      if (!existsSync(join(root, parent))) continue;
      for (const entry of readdirSync(join(root, parent), { withFileTypes: true })) {
        if (entry.isDirectory()) dirs.add(`${parent}/${entry.name}`);
      }
    } else {
      dirs.add(glob);
    }
  }
  const packages = [];
  for (const dir of [...dirs].sort()) {
    const file = join(root, dir, 'package.json');
    if (!existsSync(file)) continue;
    const json = JSON.parse(readFileSync(file, 'utf8'));
    packages.push({
      name: json.name,
      dir,
      scripts: Object.keys(json.scripts ?? {}),
      dependencies: Object.keys({ ...json.dependencies, ...json.devDependencies }),
    });
  }
  return packages;
}

/** The package a path belongs to: the one with the longest matching directory. */
function packageOf(path, packages) {
  let found;
  for (const pkg of packages) {
    if (path.startsWith(`${pkg.dir}/`) && (!found || pkg.dir.length > found.dir.length))
      found = pkg;
  }
  return found;
}

/** `names` and every package that depends on one of them, however indirectly. */
function withDependents(names, packages) {
  const affected = new Set(names);
  for (let grew = true; grew; ) {
    grew = false;
    for (const pkg of packages) {
      if (
        !affected.has(pkg.name) &&
        pkg.dependencies.some((dependency) => affected.has(dependency))
      ) {
        affected.add(pkg.name);
        grew = true;
      }
    }
  }
  return affected;
}

/**
 * The decision for a list of changed paths in a workspace (`packages` from readWorkspace).
 * Returns {all, root, docs, packages, integration, e2e, reasons}.
 */
export function plan({ paths, packages, force = false }) {
  const changed = paths.map((path) => path.trim()).filter(Boolean);
  const reasons = [];
  const byName = new Map(packages.map((pkg) => [pkg.name, pkg]));
  const result = (affected, { all = false, root = false, docs = false }) => {
    const names = packages.map((pkg) => pkg.name).filter((name) => affected.has(name));
    const integration = names.filter((name) =>
      byName.get(name).scripts.includes('test:integration'),
    );
    const e2e = affected.has(WEB) && byName.get(WEB).scripts.includes('test:e2e');
    reasons.push(
      names.length === 0 ? 'packages: none affected' : `packages: ${names.join(', ')}`,
      integration.length > 0
        ? `integration: ${integration.join(', ')}`
        : 'integration: skipped (not affected): no package with integration tests is affected',
      e2e
        ? `e2e: web app affected${all ? '' : ' (it or a package it depends on changed)'}`
        : 'e2e: skipped (not affected): no web change',
    );
    if (!root && !all)
      reasons.push(
        'root scripts, hooks and shellcheck: skipped (not affected): no script or hook change',
      );
    return { all, root: root || all, docs, packages: names, integration, e2e, reasons };
  };

  if (force) {
    reasons.push('everything: run on demand (workflow_dispatch, the run-native label or --all)');
    return result(new Set(byName.keys()), { all: true });
  }
  const setup = changed.filter((path) => WORKSPACE_SETUP.some((pattern) => pattern.test(path)));
  if (setup.length > 0) {
    reasons.push(`everything: the workspace setup changed (${setup.join(', ')})`);
    return result(new Set(byName.keys()), { all: true });
  }

  const touched = new Set();
  let root = false;
  let code = false;
  for (const path of changed) {
    if (isMarkdown(path) && !MARKDOWN_READ_BY_TESTS.some((pattern) => pattern.test(path))) continue;
    code = true;
    const pkg = !isMarkdown(path) ? packageOf(path, packages) : undefined;
    if (pkg) touched.add(pkg.name);
    else root = true;
    if (byName.has(INPUT_OF_PACKAGE.get(path))) touched.add(INPUT_OF_PACKAGE.get(path));
  }
  const docs = changed.length > 0 && !code;
  if (docs) reasons.push('Markdown only: only the hygiene checks (doc links) run, no test suite');
  return result(withDependents(touched, packages), { root, docs });
}

function main() {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const args = process.argv.slice(2);
  const unknown = args.filter((arg) => !['--force', '--all', '--json'].includes(arg));
  if (unknown.length > 0) {
    console.error('usage: node scripts/affected.mjs [--force] [--all] [--json] < changed-paths');
    process.exit(1);
  }
  const paths = readFileSync(0, 'utf8').split('\n');
  const decision = plan({
    paths,
    packages: readWorkspace(root),
    force: args.includes('--force') || args.includes('--all'),
  });
  for (const reason of decision.reasons) console.error(reason);
  if (args.includes('--json')) {
    console.log(JSON.stringify(decision));
    return;
  }
  console.log(`all=${decision.all}`);
  console.log(`root=${decision.root}`);
  console.log(`docs=${decision.docs}`);
  console.log(`packages=${decision.packages.join(',')}`);
  console.log(`integration=${decision.integration.join(',')}`);
  console.log(`e2e=${decision.e2e}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
