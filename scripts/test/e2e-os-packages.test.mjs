import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

// E002 #1470: E2E (Linux) timed out in "Install Chromium's OS packages" when the Ubuntu mirror was slow (5 to 9 minutes
// instead of 15 to 25 seconds, then the step's 10-minute limit), and the job failed with no test run. The step now finds
// the .deb files in a cache keyed on what decides the package list (the Ubuntu release and the Playwright version, plus
// the month so it renews), so a warm run does not download them. The runner image version is NOT in the key: runs land on
// different images, and a key with it hardly ever hit. What the step installs, and how the e2e tests run, are unchanged.

const ROOT = join(import.meta.dirname, '../..');
const ci = readFileSync(join(ROOT, '.github/workflows/ci.yml'), 'utf8');

const jobsSection = ci.slice(ci.indexOf('\njobs:\n'));
const keys = [...jobsSection.matchAll(/^ {2}([a-z][a-z0-9-]*):$/gm)];
const e2e = (() => {
  const i = keys.findIndex((key) => key[1] === 'e2e');
  return jobsSection.slice(keys[i].index, keys[i + 1].index);
})();
const steps = e2e.split(/\n(?= {6}- )/).slice(1);
const stepNamed = (name) => steps.find((step) => step.includes(`name: ${name}\n`));
const indexOfStep = (name) => steps.findIndex((step) => step.includes(`name: ${name}\n`));

const READ_VERSION = 'Read Playwright version';
const PREPARE = "Prepare the apt cache for Chromium's OS packages";
const RESTORE = "Restore Chromium's OS packages";
const INSTALL = "Install Chromium's OS packages";
const PRUNE = "Prune Chromium's OS packages";
const SAVE = "Save Chromium's OS packages";

const APT_PATH = '/var/cache/apt/archives/*.deb';
const keyOf = (step) => step.match(/^ {10}key: (.+)$/m)[1];

describe('E002 #1470 E2E (Linux): Chromium OS packages come from a cache', () => {
  it('restores the apt archives under a key of the Ubuntu release, the Playwright version and the month', () => {
    const restore = stepNamed(RESTORE);
    assert.ok(restore, 'a step restores the OS packages');
    assert.match(restore, /^ {8}id: apt-cache$/m);
    assert.match(restore, /uses: actions\/cache\/restore@[0-9a-f]{40} # v/);
    assert.match(restore, new RegExp(`^ {10}path: ${APT_PATH.replace(/[*.]/g, '\\$&')}$`, 'm'));
    const key = keyOf(restore);
    // The package list follows from Playwright's version (its dependency list) and from the Ubuntu release.
    assert.match(key, /runner\.os/);
    assert.match(key, /steps\.playwright\.outputs\.version/);
    assert.match(key, /steps\.apt\.outputs\.release/);
    assert.match(key, /steps\.apt\.outputs\.month/);
    // The image version changes several times a week and runs land on different images (run 44421172254 missed the
    // cache of run 44417587335 that way): it must not be in the key, in any spelling.
    assert.doesNotMatch(key, /image/i);
    assert.doesNotMatch(stepNamed(PREPARE), /ImageVersion/);
  });

  it('falls back only to the same Ubuntu release and Playwright version of another month', () => {
    const restore = stepNamed(RESTORE);
    const restoreKeys = restore.match(/^ {10}restore-keys: (.+)$/m);
    assert.ok(restoreKeys, 'the restore has restore-keys, one line');
    // The key without the month and the trailing dash: a prefix of the key, never of another release or Playwright
    // version, whose package lists differ.
    const key = keyOf(restore);
    const prefix = key.replace(/\$\{\{ steps\.apt\.outputs\.month \}\}$/, '');
    assert.equal(restoreKeys[1], prefix);
    assert.match(prefix, /runner\.os/);
    assert.match(prefix, /steps\.apt\.outputs\.release/);
    assert.match(prefix, /steps\.playwright\.outputs\.version/);
    assert.doesNotMatch(prefix, /month/);
  });

  it('deletes files that no longer fit the mirror before it saves, so the caches do not pile up', () => {
    const prune = stepNamed(PRUNE);
    assert.ok(prune, 'a step prunes the archives');
    assert.match(prune, /^ {8}run: sudo apt-get autoclean$/m);
    assert.match(prune, /^ {8}if: steps\.apt-cache\.outputs\.cache-hit != 'true'$/m);
    assert.match(prune, /^ {8}continue-on-error: true$/m);
    assert.equal(indexOfStep(PRUNE), indexOfStep(INSTALL) + 1);
    assert.equal(indexOfStep(SAVE), indexOfStep(PRUNE) + 1);
  });

  it('saves the cache right after the install, under the same key, only when it was not restored', () => {
    const save = stepNamed(SAVE);
    assert.ok(save, 'a step saves the OS packages');
    assert.match(save, /uses: actions\/cache\/save@[0-9a-f]{40} # v/);
    assert.match(save, /^ {8}if: steps\.apt-cache\.outputs\.cache-hit != 'true'$/m);
    assert.equal(keyOf(save), keyOf(stepNamed(RESTORE)));
    assert.match(save, /^ {10}path: \/var\/cache\/apt\/archives\/\*\.deb$/m);
    // A cache problem must not fail the job: the next run installs from the mirror.
    assert.match(save, /^ {8}continue-on-error: true$/m);
  });

  it('reads the Playwright version and prepares apt before the restore, and installs after it', () => {
    const order = [READ_VERSION, PREPARE, RESTORE, INSTALL, PRUNE, SAVE].map(indexOfStep);
    assert.ok(
      order.every((i) => i >= 0),
      `all six steps exist: ${order}`,
    );
    assert.deepEqual(
      order,
      [...order].sort((a, b) => a - b),
    );
  });

  it('lets the runner user write the archives, keeps downloaded packages and records the release and the month', () => {
    const prepare = stepNamed(PREPARE);
    assert.match(prepare, /^ {8}id: apt$/m);
    assert.match(prepare, /chmod a\+rwx \/var\/cache\/apt\/archives/);
    assert.match(prepare, /APT::Keep-Downloaded-Packages "true"/);
    assert.match(prepare, /release=\$\{ImageOS:-unknown\}"? ?>>"\$GITHUB_OUTPUT"/);
    assert.match(prepare, /month=\$\(date -u \+%Y-%m\)"? ?>>"\$GITHUB_OUTPUT"/);
  });

  it('still installs exactly what Playwright needs: through scripts/playwright-deps.sh, with its limits', () => {
    const install = stepNamed(INSTALL);
    assert.match(install, /^ {8}run: scripts\/playwright-deps\.sh$/m);
    assert.doesNotMatch(install, /\bif:/, 'the install runs on every run, cache hit or not');
    assert.match(install, /^ {8}timeout-minutes: 10$/m);
    assert.doesNotMatch(ci, /playwright install-deps|--with-deps|apt-get install/);
  });
});
