import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const ROOT = join(import.meta.dirname, '../..');
const read = (path) => readFileSync(join(ROOT, path), 'utf8');

// #293: the integration and e2e results are cached by their inputs, and compose.yaml (the local database) is one of them.
// CI runs the same tests against its own Postgres service containers, so the images must stay the same, or a Postgres
// bump in one place would not reach the cache key of the other.
describe('#293 the Postgres image of CI is the one of compose.yaml', () => {
  const images = (text) => [...text.matchAll(/^\s+image:\s*(postgres:\S+)\s*$/gm)].map((m) => m[1]);

  it('compose.yaml has one Postgres image', () => {
    assert.equal(images(read('compose.yaml')).length, 1);
  });

  it('every Postgres service of ci.yml uses it', () => {
    const [compose] = images(read('compose.yaml'));
    const ci = images(read('.github/workflows/ci.yml'));
    assert.ok(ci.length >= 2, 'the Checks and E2E jobs each have a Postgres service');
    for (const image of ci) assert.equal(image, compose);
  });

  it('the cache inputs of the integration and e2e tests include compose.yaml', () => {
    const { tasks } = JSON.parse(read('turbo.json'));
    for (const task of ['test:integration', 'test:e2e'])
      assert.ok(tasks[task].inputs.includes('$TURBO_ROOT$/compose.yaml'), task);
  });
});
