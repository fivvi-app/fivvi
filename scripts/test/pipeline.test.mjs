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

describe('pipeline.sh (ADR-034, ADR-035)', () => {
  it('prints each setting', () => {
    for (const [ci, review, builders] of [
      ['fast', 'split', 4],
      ['full', 'per-pr', 2],
      ['fast', 'per-pr', 1],
      ['full', 'split', 12],
      ['lean', 'split', 1],
      ['lean', 'per-pr', 3],
    ]) {
      const settings = { ci, review, builders };
      assert.equal(run(['get', 'ci'], settings).stdout, `${ci}\n`);
      assert.equal(run(['get', 'review'], settings).stdout, `${review}\n`);
      assert.equal(run(['get', 'builders'], settings).stdout, `${builders}\n`);
    }
  });

  it('builders is a positive integer, and fails closed otherwise (ADR-035)', () => {
    for (const [content, message] of [
      [{ ci: 'lean', review: 'split' }, /has no 'builders' setting/],
      [{ ci: 'lean', review: 'split', builders: 0 }, /'builders' is '0'/],
      [{ ci: 'lean', review: 'split', builders: -1 }, /'builders' is '-1'/],
      [{ ci: 'lean', review: 'split', builders: 1.5 }, /'builders' is '1.5'/],
      [{ ci: 'lean', review: 'split', builders: '1' }, /has no 'builders' setting/],
      [{ ci: 'lean', review: 'split', builders: 'many' }, /has no 'builders' setting/],
      [{ ci: 'lean', review: 'split', builders: null }, /has no 'builders' setting/],
      [{ ci: 'lean', review: 'split', builders: true }, /has no 'builders' setting/],
      [{ ci: 'lean', review: 'split', builders: 1e30 }, /'builders' is/],
      ['not json', /has no 'builders' setting/],
      [undefined, /no .*pipeline\.json/],
    ]) {
      const r = run(['get', 'builders'], content);
      assert.notEqual(r.status, 0, JSON.stringify(content));
      assert.match(r.stderr, message);
      assert.equal(r.stdout, '');
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
      [['get', 'ci'], { ci: 'Lean', review: 'split' }, /'ci' is 'Lean'/],
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

  const EVENTS = ['pull_request', 'merge_group', 'push', 'schedule', 'workflow_dispatch'];

  it('ui-tests prints true with ci full on every event, and with ci fast or lean only for schedule and workflow_dispatch', () => {
    for (const event of EVENTS) {
      const full = run(['ui-tests', '--event', event], { ci: 'full', review: 'split' });
      assert.equal(full.status, 0, full.stderr);
      assert.equal(full.stdout, 'true\n', `full ${event}`);
      for (const ci of ['fast', 'lean']) {
        const r = run(['ui-tests', '--event', event], { ci, review: 'split' });
        assert.equal(r.status, 0, r.stderr);
        assert.equal(
          r.stdout,
          event === 'schedule' || event === 'workflow_dispatch' ? 'true\n' : 'false\n',
          `${ci} ${event}`,
        );
      }
    }
  });

  it('integration-tests prints true with ci full and fast on every event, and with ci lean only for schedule and workflow_dispatch (ADR-035)', () => {
    for (const event of EVENTS) {
      for (const ci of ['full', 'fast']) {
        const r = run(['integration-tests', '--event', event], { ci, review: 'split' });
        assert.equal(r.status, 0, r.stderr);
        assert.equal(r.stdout, 'true\n', `${ci} ${event}`);
      }
      const lean = run(['integration-tests', '--event', event], { ci: 'lean', review: 'split' });
      assert.equal(lean.status, 0, lean.stderr);
      assert.equal(
        lean.stdout,
        event === 'schedule' || event === 'workflow_dispatch' ? 'true\n' : 'false\n',
        `lean ${event}`,
      );
    }
  });

  it('integration-tests fails closed like ui-tests, and needs --event with a value', () => {
    for (const content of [undefined, { review: 'split' }, { ci: 'sometimes' }, 'not json']) {
      const r = run(['integration-tests', '--event', 'pull_request'], content);
      assert.notEqual(r.status, 0, JSON.stringify(content));
      assert.equal(r.stdout, '');
      assert.notEqual(r.stderr, '');
    }
    for (const args of [
      ['integration-tests'],
      ['integration-tests', '--event'],
      ['integration-tests', '--event', ''],
      ['integration-tests', 'schedule'],
      ['integration-tests', '--event', 'schedule', 'extra'],
    ]) {
      const r = run(args, { ci: 'lean', review: 'split' });
      assert.notEqual(r.status, 0, args.join(' '));
      assert.equal(r.stdout, '');
    }
  });

  it('ui-tests fails closed: an unreadable or unknown switch is an error with no output, on every event', () => {
    for (const event of ['pull_request', 'schedule', 'workflow_dispatch']) {
      for (const content of [
        undefined,
        { review: 'split' },
        { ci: 'sometimes', review: 'split' },
        'not json',
      ]) {
        const r = run(['ui-tests', '--event', event], content);
        assert.notEqual(r.status, 0, `${event} ${JSON.stringify(content)}`);
        assert.equal(r.stdout, '');
        assert.notEqual(r.stderr, '');
      }
    }
  });

  it('ui-tests needs --event with a value', () => {
    for (const args of [
      ['ui-tests'],
      ['ui-tests', '--event'],
      ['ui-tests', '--event', ''],
      ['ui-tests', 'schedule'],
      ['ui-tests', '--event', 'schedule', 'extra'],
    ]) {
      const r = run(args, { ci: 'full', review: 'split' });
      assert.notEqual(r.status, 0, args.join(' '));
      assert.equal(r.stdout, '');
    }
  });

  it('the header documents ui-tests, integration-tests, builders and lean', () => {
    const header = readFileSync(SCRIPT, 'utf8').split('\nset -euo')[0];
    assert.match(header, /^# +pipeline\.sh ui-tests --event <event>/m);
    assert.match(header, /^# +pipeline\.sh integration-tests --event <event>/m);
    assert.match(header, /^# +pipeline\.sh get ci\|review\|builders/m);
    assert.match(header, /^# +ci +lean /m);
    assert.match(header, /^# +builders /m);
  });

  it('the committed switch is valid', () => {
    const committed = JSON.parse(
      readFileSync(join(import.meta.dirname, '..', '..', '.github', 'pipeline.json'), 'utf8'),
    );
    assert.deepEqual(Object.keys(committed).sort(), ['builders', 'ci', 'review']);
    assert.ok(['lean', 'fast', 'full'].includes(committed.ci));
    assert.ok(['split', 'per-pr'].includes(committed.review));
    assert.ok(Number.isInteger(committed.builders) && committed.builders >= 1);
  });
});
