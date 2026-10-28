// Keeps the modification times of unchanged iOS sources stable between CI runs (#293 AC15).
//
// CI restores the iOS DerivedData from the cache, but a fresh checkout gives every source file the time of the checkout,
// and Xcode decides what to compile by the modification time of the inputs: with every input "changed", Swift compiled
// almost everything (~90 s) and the asset catalog every time (~50 s), whatever the cache held. So after a build the job
// records, for each source file, its content hash and modification time (a manifest in apps/ios/.build, which the cache
// holds), and before the next build puts the recorded time back on every file whose content is the same. A file that did
// change keeps the checkout's time, which is newer than its product, so it is compiled.
//
//   node scripts/ios-mtimes.mjs save      writes apps/ios/.build/source-mtimes.json for the files git tracks under
//                                          the paths the iOS build reads
//   node scripts/ios-mtimes.mjs restore   sets the recorded time on each file whose content hash is unchanged; prints
//                                          how many it restored and how many changed or are new
//
// Plain JavaScript without dependencies, so the root script tests run it on Linux as well.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// What the iOS build reads (the same list as the iOS paths of scripts/native-jobs.sh, without the scripts).
export const SOURCE_PATHS = [
  'apps/ios',
  'apps/Version.xcconfig',
  'packages/contract/swift',
  'packages/i18n/generated/ios',
  'packages/design-tokens/FivviDesignTokens',
];
export const MANIFEST = 'apps/ios/.build/source-mtimes.json';

const sha1 = (file) => createHash('sha1').update(readFileSync(file)).digest('hex');

function trackedFiles(root) {
  const out = execFileSync('git', ['-C', root, 'ls-files', '-z', '--', ...SOURCE_PATHS], {
    encoding: 'utf8',
  });
  return out.split('\0').filter((file) => file && existsSync(join(root, file)));
}

/** Records the hash and modification time (seconds, with fractions) of every tracked source file. */
export function save(root) {
  const files = {};
  for (const file of trackedFiles(root)) {
    files[file] = {
      sha1: sha1(join(root, file)),
      mtime: statSync(join(root, file)).mtimeMs / 1000,
    };
  }
  const manifest = join(root, MANIFEST);
  mkdirSync(dirname(manifest), { recursive: true });
  writeFileSync(manifest, `${JSON.stringify({ files })}\n`);
  return Object.keys(files).length;
}

/** Puts the recorded modification time on every file whose content is the recorded one. */
export function restore(root) {
  const manifest = join(root, MANIFEST);
  if (!existsSync(manifest))
    return { restored: 0, changed: trackedFiles(root).length, manifest: false };
  const { files } = JSON.parse(readFileSync(manifest, 'utf8'));
  let restored = 0;
  let changed = 0;
  for (const file of trackedFiles(root)) {
    const recorded = files[file];
    if (recorded && recorded.sha1 === sha1(join(root, file))) {
      utimesSync(join(root, file), recorded.mtime, recorded.mtime);
      restored += 1;
    } else {
      changed += 1;
    }
  }
  return { restored, changed, manifest: true };
}

function main() {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const [command, ...rest] = process.argv.slice(2);
  if ((command !== 'save' && command !== 'restore') || rest.length > 0) {
    console.error('usage: node scripts/ios-mtimes.mjs save|restore');
    process.exit(1);
  }
  if (command === 'save') {
    console.log(`Recorded the modification times of ${save(root)} iOS source files in ${MANIFEST}`);
    return;
  }
  const result = restore(root);
  console.log(
    result.manifest
      ? `Restored the modification times of ${result.restored} unchanged iOS source files; ${result.changed} changed or new keep the checkout's.`
      : `No ${MANIFEST} in the cache: every iOS source file keeps the checkout's modification time.`,
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
