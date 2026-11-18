import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

// E002 #1470: E2E (Linux) timed out in "Install Chromium's OS packages" when the Ubuntu mirror was slow (5 to 9 minutes
// instead of 15 to 25 seconds, then the step's 10-minute limit), and the job failed with no test run. The step now finds
// the .deb files in a cache keyed on what decides the package list (the runner image and the Playwright version), so a
// warm run does not download them. What the step installs, and how the e2e tests run, are unchanged.

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
const SAVE = "Save Chromium's OS packages";

const APT_PATH = '/var/cache/apt/archives/*.deb';
const keyOf = (step) => step.match(/^ {10}key: (.+)$/m)[1];

describe('E002 #1470 E2E (Linux): Chromium OS packages come from a cache', () => {
  it('restores the apt archives under a key of the runner image and the Playwright version', () => {
    const restore = stepNamed(RESTORE);
    assert.ok(restore, 'a step restores the OS packages');
    assert.match(restore, /^ {8}id: apt-cache$/m);
    assert.match(restore, /uses: actions\/cache\/restore@[0-9a-f]{40} # v/);
    assert.match(restore, new RegExp(`^ {10}path: ${APT_PATH.replace(/[*.]/g, '\\$&')}$`, 'm'));
    const key = keyOf(restore);
    // The package list follows from Playwright's version (its dependency list) and from the Ubuntu image (the versions).
    assert.match(key, /runner\.os/);
    assert.match(key, /steps\.playwright\.outputs\.version/);
    assert.match(key, /steps\.apt\.outputs\.image/);
    // No other key may supply it: a cache of another image or Playwright version would hold other packages.
    assert.doesNotMatch(restore, /restore-keys/);
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
    assert.equal(indexOfStep(SAVE), indexOfStep(INSTALL) + 1);
  });

  it('reads the Playwright version and prepares apt before the restore, and installs after it', () => {
    const order = [READ_VERSION, PREPARE, RESTORE, INSTALL, SAVE].map(indexOfStep);
    assert.ok(
      order.every((i) => i >= 0),
      `all five steps exist: ${order}`,
    );
    assert.deepEqual(
      order,
      [...order].sort((a, b) => a - b),
    );
  });

  it('lets the runner user write the archives, keeps downloaded packages and records the image', () => {
    const prepare = stepNamed(PREPARE);
    assert.match(prepare, /^ {8}id: apt$/m);
    assert.match(prepare, /chmod a\+rwx \/var\/cache\/apt\/archives/);
    assert.match(prepare, /APT::Keep-Downloaded-Packages "true"/);
    assert.match(prepare, /image=.*ImageVersion.*>>"\$GITHUB_OUTPUT"/);
  });

  it('still installs exactly what Playwright needs: through scripts/playwright-deps.sh, with its limits', () => {
    const install = stepNamed(INSTALL);
    assert.match(install, /^ {8}run: scripts\/playwright-deps\.sh$/m);
    assert.doesNotMatch(install, /\bif:/, 'the install runs on every run, cache hit or not');
    assert.match(install, /^ {8}timeout-minutes: 10$/m);
    assert.doesNotMatch(ci, /playwright install-deps|--with-deps|apt-get install/);
  });
});
