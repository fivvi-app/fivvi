import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { rootTestInputs, uncovered, uncoveredBy } from './turbo-inputs.mjs';

describe('E017 #576: the turbo inputs check of the root tests', () => {
  it('names a file that no input covers and passes one that an input covers', () => {
    const inputs = ['scripts/**', 'apps/android/**/*.kt'];
    assert.deepEqual(
      uncoveredBy(inputs, [
        'scripts/a.sh',
        'apps/android/app/src/main/kotlin/A.kt',
        'apps/android/gradle/libs.versions.toml',
        'apps/android/gradle/libs.versions.toml',
      ]),
      ['apps/android/gradle/libs.versions.toml'],
    );
  });

  it('needs no input for turbo.json itself', () => {
    assert.deepEqual(uncoveredBy([], ['turbo.json']), []);
  });

  it('reads the inputs of //#test:root from the real turbo.json', () => {
    assert.ok(rootTestInputs().includes('scripts/**'));
    assert.deepEqual(uncovered(['scripts/test/turbo-inputs.mjs']), []);
    assert.deepEqual(uncovered(['apps/nowhere/file.txt']), ['apps/nowhere/file.txt']);
  });
});
