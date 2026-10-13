// Vendors Matt Pocock's skills (https://github.com/mattpocock/skills, MIT) into .agents/skills,
// pinned to the commit in .agents/skills.lock.json. Copilot and Codex read .agents/skills;
// Claude Code reads it through the .claude/skills symlink.
//
//   node .agents/sync-skills.mjs            re-vendor the pinned commit
//   node .agents/sync-skills.mjs --update   move the pin to the latest main, then re-vendor
//   node .agents/sync-skills.mjs --check    fail if .agents/skills differs from the pinned commit
import { execFileSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const LOCK = join(ROOT, '.agents/skills.lock.json');
const SKILLS = join(ROOT, '.agents/skills');
const LICENSE = join(ROOT, '.agents/LICENSE.mattpocock-skills');

const git = (cwd, ...args) =>
  execFileSync('git', ['-C', cwd, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

function fetchSource(source, ref) {
  const dir = mkdtempSync(join(tmpdir(), 'mattpocock-skills-'));
  git(dir, 'init', '--quiet');
  git(dir, 'fetch', '--quiet', '--depth=1', source, ref);
  git(dir, 'checkout', '--quiet', 'FETCH_HEAD');
  return { dir, commit: git(dir, 'rev-parse', 'HEAD').trim() };
}

/** Skill folder name → its path in the source checkout, for the vendored categories. */
function sourceSkills(dir, categories) {
  const skills = new Map();
  for (const category of categories) {
    const base = join(dir, 'skills', category);
    for (const entry of readdirSync(base, { withFileTypes: true })) {
      if (!entry.isDirectory() || !existsSync(join(base, entry.name, 'SKILL.md'))) continue;
      if (skills.has(entry.name)) throw new Error(`Skill ${entry.name} exists in two categories.`);
      skills.set(entry.name, join(base, entry.name));
    }
  }
  return skills;
}

function filesOf(dir, prefix = '') {
  return readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) =>
      entry.isDirectory()
        ? filesOf(join(dir, entry.name), `${prefix}${entry.name}/`)
        : [`${prefix}${entry.name}`],
    )
    .sort();
}

function differences(from, to) {
  const a = existsSync(from) ? filesOf(from) : [];
  const b = existsSync(to) ? filesOf(to) : [];
  const all = [...new Set([...a, ...b])].sort();
  return all.filter((file) => {
    const left = join(from, file);
    const right = join(to, file);
    return !(
      existsSync(left) &&
      existsSync(right) &&
      readFileSync(left).equals(readFileSync(right))
    );
  });
}

function main() {
  const mode = process.argv[2] ?? '--sync';
  if (!['--sync', '--update', '--check'].includes(mode)) throw new Error(`Unknown option ${mode}.`);

  const lock = JSON.parse(readFileSync(LOCK, 'utf8'));
  const { dir, commit } = fetchSource(lock.source, mode === '--update' ? 'main' : lock.commit);
  try {
    const skills = sourceSkills(dir, lock.categories);
    const local = readdirSync(SKILLS, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !lock.skills.includes(entry.name))
      .map((entry) => entry.name);
    const clash = local.filter((name) => skills.has(name));
    if (clash.length > 0) throw new Error(`Local skills clash with vendored ones: ${clash}.`);

    if (mode === '--check') {
      const changed = [...skills].flatMap(([name, path]) =>
        differences(path, join(SKILLS, name)).map((file) => `${name}/${file}`),
      );
      const stale = lock.skills.filter((name) => !skills.has(name));
      if (changed.length + stale.length > 0) {
        console.error(
          `Vendored skills differ from ${lock.commit}:\n${[...changed, ...stale].join('\n')}\n` +
            'Run `node .agents/sync-skills.mjs` (never edit vendored skills by hand).',
        );
        process.exitCode = 1;
      }
      return;
    }

    for (const name of lock.skills) rmSync(join(SKILLS, name), { recursive: true, force: true });
    for (const [name, path] of skills) cpSync(path, join(SKILLS, name), { recursive: true });
    cpSync(join(dir, 'LICENSE'), LICENSE);
    const next = { ...lock, commit, skills: [...skills.keys()].sort() };
    writeFileSync(LOCK, `${JSON.stringify(next, null, 2)}\n`);
    console.log(`Vendored ${next.skills.length} skills from ${commit}.`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

main();
