import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';

const SCRIPT = join(import.meta.dirname, '..', 'pipeline.sh');
const dir = mkdtempSync(join(tmpdir(), 'pipeline-'));
after(() => rmSync(dir, { recursive: true, force: true }));

const run = (args, content) => {
  const file = join(dir, 'pipeline.json');
  if (content === undefined) rmSync(file, { force: true });
  else writeFileSync(file, typeof content === 'string' ? content : JSON.stringify(content));
  return spawnSync('bash', [SCRIPT, ...args], {
    encoding: 'utf8',
    env: { ...process.env, FIVVI_PIPELINE_FILE: file },
  });
};

describe('pipeline.sh (ADR-034)', () => {
  it('prints each setting', () => {
    for (const [ci, review] of [
      ['fast', 'split'],
      ['full', 'per-pr'],
      ['fast', 'per-pr'],
      ['full', 'split'],
    ]) {
      const settings = { ci, review };
      assert.equal(run(['get', 'ci'], settings).stdout, `${ci}\n`);
      assert.equal(run(['get', 'review'], settings).stdout, `${review}\n`);
    }
  });

  it('fails closed on a missing file, key or unknown value', () => {
    for (const [args, content, message] of [
      [['get', 'ci'], undefined, /no .*pipeline\.json/],
      [['get', 'ci'], { review: 'split' }, /has no 'ci' setting/],
      [['get', 'review'], { ci: 'fast', review: 'none' }, /'review' is 'none'/],
      [['get', 'ci'], { ci: 'Fast', review: 'split' }, /'ci' is 'Fast'/],
      [['get', 'ci'], { ci: true, review: 'split' }, /has no 'ci' setting/],
      [['get', 'ci'], 'not json', /has no 'ci' setting/],
      [['get', 'speed'], { ci: 'fast', review: 'split' }, /unknown setting 'speed'/],
    ]) {
      const r = run(args, content);
      assert.notEqual(r.status, 0, `${args} ${JSON.stringify(content)}`);
      assert.match(r.stderr, message);
      assert.equal(r.stdout, '');
    }
  });

  it('needs exactly get and one setting', () => {
    for (const args of [[], ['get'], ['set', 'ci'], ['get', 'ci', 'extra']]) {
      assert.notEqual(run(args, { ci: 'fast', review: 'split' }).status, 0, args.join(' '));
    }
  });

  it('the committed switch is valid', () => {
    const committed = JSON.parse(
      readFileSync(join(import.meta.dirname, '..', '..', '.github', 'pipeline.json'), 'utf8'),
    );
    assert.deepEqual(Object.keys(committed).sort(), ['ci', 'review']);
    assert.ok(['fast', 'full'].includes(committed.ci));
    assert.ok(['split', 'per-pr'].includes(committed.review));
  });
});
