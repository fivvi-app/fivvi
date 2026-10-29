import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { MANIFEST, restore, save } from '../ios-mtimes.mjs';

// #293 AC15: a fresh checkout gives every file the time of the checkout; the DerivedData cache only helps when the
// files that did not change get their old modification time back.
describe('#293 ios-mtimes: unchanged iOS sources keep their modification time between runs', () => {
  let root;
  const file = (path, text) => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  const mtime = (path) => Math.round(statSync(join(root, path)).mtimeMs / 1000);
  const touch = (path, seconds) => utimesSync(join(root, path), seconds, seconds);
  const OLD = 1_700_000_000;
  const CHECKOUT = 1_800_000_000;

  before(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'ios-mtimes-')));
    file('apps/ios/FivviPro/App.swift', 'struct App {}\n');
    file('apps/ios/FivviPro/Hello.swift', 'struct Hello {}\n');
    file('apps/ios/.gitignore', '.build\n');
    file('apps/Version.xcconfig', 'MARKETING_VERSION = 0.1.0\n');
    file('packages/contract/swift/Package.swift', '// swift-tools-version: 6.0\n');
    file('docs/other.md', 'not a source of the build\n');
    const git = (...args) =>
      execFileSync('git', [
        '-C',
        root,
        '-c',
        'user.name=T',
        '-c',
        'user.email=t@example.com',
        ...args,
      ]);
    git('init', '--quiet');
    git('add', '.');
    git('commit', '--quiet', '-m', 'chore: fixture');
  });
  after(() => rmSync(root, { recursive: true, force: true }));

  it('a second checkout gets the recorded time back on every file whose content is the same', () => {
    for (const path of [
      'apps/ios/FivviPro/App.swift',
      'apps/ios/FivviPro/Hello.swift',
      'apps/Version.xcconfig',
    ])
      touch(path, OLD);
    assert.equal(save(root), 5, 'the sources git tracks under the iOS paths, nothing else');

    // The next run: a new checkout, every file has the time of the checkout, and one file changed.
    for (const path of [
      'apps/ios/FivviPro/App.swift',
      'apps/ios/FivviPro/Hello.swift',
      'apps/Version.xcconfig',
    ])
      touch(path, CHECKOUT);
    writeFileSync(
      join(root, 'apps/ios/FivviPro/Hello.swift'),
      'struct Hello { var changed = 1 }\n',
    );
    touch('apps/ios/FivviPro/Hello.swift', CHECKOUT);

    const result = restore(root);

    assert.equal(mtime('apps/ios/FivviPro/App.swift'), OLD, 'unchanged: the old time');
    assert.equal(mtime('apps/Version.xcconfig'), OLD);
    assert.equal(
      mtime('apps/ios/FivviPro/Hello.swift'),
      CHECKOUT,
      'changed: the time of the checkout, newer than its product',
    );
    assert.deepEqual(result, { restored: 4, changed: 1, manifest: true });
  });

  it('does not touch a file outside the iOS paths, and restores nothing without a manifest', () => {
    touch('docs/other.md', CHECKOUT);
    restore(root);
    assert.equal(mtime('docs/other.md'), CHECKOUT);

    rmSync(join(root, MANIFEST));
    assert.deepEqual(restore(root), { restored: 0, changed: 5, manifest: false });
  });

  it('works as a command: save, then restore', () => {
    const run = (command) =>
      spawnSync('node', [join(import.meta.dirname, '..', 'ios-mtimes.mjs'), command], {
        encoding: 'utf8',
      });
    assert.equal(run('nope').status, 1);
    // The command works on this repository, where there is no manifest yet: nothing to restore, nothing fails.
    const result = run('restore');
    assert.equal(result.status, 0, result.stderr);
    assert.match(
      result.stdout,
      /Restored the modification times of \d+|No apps\/ios\/\.build\/source-mtimes\.json/,
    );
  });
});
