import { readFileSync } from 'node:fs';
import {
  APP_ROLE_NAME,
  APP_ROLE_TEST_PASSWORD,
  CRON_ROLE_NAME,
  CRON_ROLE_TEST_PASSWORD,
} from '@fivvi/testing/database/server';
import { describe, expect, it } from 'vitest';

const EXAMPLES = ['packages/database/.env.example', 'apps/web/.env.example'];

function readExample(path: string): Map<string, string> {
  const content = readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8');
  const values = new Map<string, string>();
  for (const line of content.split('\n')) {
    const match = /^([A-Z_]+)=(.*)$/.exec(line);
    if (match?.[1] !== undefined && match[2] !== undefined) values.set(match[1], match[2]);
  }
  return values;
}

describe('E011 local app role password', () => {
  // `fivvi_app` is cluster-wide: local dev, every worktree and the tests share one local
  // Postgres, and `db:migrate` and the test setup both set its password. If the two differ,
  // each run locks the other out (28P01).
  it.each(EXAMPLES)('%s uses the password the test setup gives the app role', (path) => {
    const url = new URL(readExample(path).get('APP_DATABASE_URL') ?? '');

    expect(url.username).toBe(APP_ROLE_NAME);
    expect(decodeURIComponent(url.password)).toBe(APP_ROLE_TEST_PASSWORD);
  });

  it('packages/database/.env.example sets APP_DATABASE_PASSWORD to the same password', () => {
    expect(readExample('packages/database/.env.example').get('APP_DATABASE_PASSWORD')).toBe(
      APP_ROLE_TEST_PASSWORD,
    );
  });
});

describe('E012 local cron role password', () => {
  // `fivvi_cron` is cluster-wide like `fivvi_app`: the test setup sets its password too.
  it('packages/database/.env.example uses the password the test setup gives the cron role', () => {
    const example = readExample('packages/database/.env.example');
    const url = new URL(example.get('CRON_DATABASE_URL') ?? '');

    expect(url.username).toBe(CRON_ROLE_NAME);
    expect(decodeURIComponent(url.password)).toBe(CRON_ROLE_TEST_PASSWORD);
    expect(example.get('CRON_DATABASE_PASSWORD')).toBe(CRON_ROLE_TEST_PASSWORD);
  });
});
