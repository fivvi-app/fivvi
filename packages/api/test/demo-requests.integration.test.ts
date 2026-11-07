import { readFileSync } from 'node:fs';
import {
  authRateLimits,
  consumeRateLimit,
  createDatabase,
  type DatabaseClient,
} from '@fivvi/database';
import type { DemoRequestMail } from '@fivvi/email/demo-request-mail';
import { createCaptureTransport, createErrorReporter } from '@fivvi/observability';
import { cloneTemplateDatabase, type TestDatabase } from '@fivvi/testing/database';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { type ApiDependencies, createApp, NO_DEPENDENCIES } from '../src/index.ts';

// F064 (spec #611, ticket #641), AC5 and AC6: POST /v1/demo-requests. The visitor is synthetic.
// The rate limit counts in a real Postgres; the email is a stub, so nothing leaves the process.

const contract = JSON.parse(
  readFileSync(new URL('../../contract/openapi.json', import.meta.url), 'utf8'),
);

const VALID = {
  name: 'Anna de Vries',
  email: 'anna@example.com',
  businessKind: 'studio',
  trainerCount: 'two-to-four',
  message: 'Ik wil graag de roosters zien.',
  locale: 'nl-NL',
  website: '',
};

describe('F064 POST /v1/demo-requests', () => {
  let database: TestDatabase;
  let client: DatabaseClient;
  let sent: DemoRequestMail[];
  let sendDemoRequest: ReturnType<typeof vi.fn<(mail: DemoRequestMail) => Promise<void>>>;

  beforeAll(async () => {
    database = await cloneTemplateDatabase();
    client = createDatabase({ url: database.url, maxConnections: 2 });
  });

  afterAll(async () => {
    await client?.close();
    await database?.drop();
  });

  beforeEach(() => {
    sent = [];
    sendDemoRequest = vi.fn((mail) => {
      sent.push(mail);
      return Promise.resolve();
    });
  });

  afterEach(() => vi.restoreAllMocks());

  const api = (overrides: Partial<ApiDependencies> = {}) =>
    createApp({
      ...NO_DEPENDENCIES,
      sendDemoRequest,
      consumeRateLimit: (key, rule) => consumeRateLimit(client.db, key, rule, new Date()),
      ...overrides,
    });

  /** Each test has its own IP address, so the limits of one never count for another. */
  let nextIp = 1;
  const freshIp = () => `192.0.2.${nextIp++}`;

  const post = (body: unknown, { ip = freshIp(), server = api() } = {}) =>
    server.request('/v1/demo-requests', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(ip ? { 'x-real-ip': ip } : {}) },
      body: JSON.stringify(body),
    });

  it('AC5: a valid request sends one email with the visitor’s answers and answers 202 with no body', async () => {
    const response = await post(VALID);

    expect(response.status).toBe(202);
    expect(await response.text()).toBe('');
    expect(sent).toEqual([
      {
        name: 'Anna de Vries',
        email: 'anna@example.com',
        businessKind: 'studio',
        trainerCount: 'two-to-four',
        message: 'Ik wil graag de roosters zien.',
        locale: 'nl-NL',
      },
    ]);
  });

  it('AC5: the honeypot is not part of the email, and an empty message is none', async () => {
    await post({ ...VALID, message: '   ', locale: 'en' });

    expect(sent[0]).toMatchObject({ message: null, locale: 'en' });
    expect(sent[0]).not.toHaveProperty('website');
  });

  it('AC5: the message may be left out', async () => {
    const { message: _message, ...withoutMessage } = VALID;

    expect((await post(withoutMessage)).status).toBe(202);
    expect(sent[0]?.message).toBeNull();
  });

  it('AC5: trims the name', async () => {
    await post({ ...VALID, name: '  Anna  ' });

    expect(sent[0]).toMatchObject({ name: 'Anna' });
  });

  it('AC5: stores nothing about the visitor, and logs nothing', async () => {
    const logs = [
      vi.spyOn(console, 'log').mockImplementation(() => {}),
      vi.spyOn(console, 'info').mockImplementation(() => {}),
      vi.spyOn(console, 'warn').mockImplementation(() => {}),
      vi.spyOn(console, 'error').mockImplementation(() => {}),
    ];
    const ip = '198.51.100.77';

    // The route has no database but the rate limit: any other query would reject here.
    expect((await post(VALID, { ip })).status).toBe(202);

    const rows = await client.db.select().from(authRateLimits);
    const stored = JSON.stringify(rows);
    for (const secret of ['Anna', 'anna@example.com', 'roosters', ip]) {
      expect(stored).not.toContain(secret);
    }
    for (const log of logs) expect(log).not.toHaveBeenCalled();
  });

  it.each([
    ['a missing name', { name: undefined }, 'name'],
    ['a blank name', { name: '   ' }, 'name'],
    ['a name over 100 characters', { name: 'a'.repeat(101) }, 'name'],
    ['a name with a line break', { name: 'Anna\nBcc: x@example.com' }, 'name'],
    ['a missing email address', { email: undefined }, 'email'],
    ['an email address that is none', { email: 'anna' }, 'email'],
    ['an email address without a domain', { email: 'anna@' }, 'email'],
    ['an email address over 254 characters', { email: `${'a'.repeat(250)}@example.com` }, 'email'],
    ['a kind of business that is not offered', { businessKind: 'circus' }, 'businessKind'],
    ['a missing number of trainers', { trainerCount: undefined }, 'trainerCount'],
    ['a message over 2000 characters', { message: 'a'.repeat(2001) }, 'message'],
    ['a language that is not supported', { locale: 'de-DE' }, 'locale'],
  ])('AC6: %s is a 400 that names the field, and sends no email', async (_what, change, path) => {
    const response = await post({ ...VALID, ...change });

    expect(response.status).toBe(400);
    const body = (await response.json()) as { code: string; issues: { path: string }[] };
    expect(body.code).toBe('validation_failed');
    expect(body.issues.map((issue) => issue.path)).toContain(path);
    expect(sendDemoRequest).not.toHaveBeenCalled();
  });

  it('AC6: a refused request does not use up the visitor’s limit', async () => {
    const ip = freshIp();
    for (let i = 0; i < 10; i++) await post({ ...VALID, email: 'anna' }, { ip });

    expect((await post(VALID, { ip })).status).toBe(202);
  });

  it('AC6: a filled honeypot sends no email, and looks like any other success', async () => {
    const real = await post(VALID);
    const trap = await post({ ...VALID, website: 'https://spam.example.com' });

    expect(trap.status).toBe(real.status);
    expect(await trap.text()).toBe('');
    expect(sent).toHaveLength(1);
  });

  it('AC6: a honeypot of spaces is empty, and the request is real', async () => {
    expect((await post({ ...VALID, website: '   ' })).status).toBe(202);
    expect(sent).toHaveLength(1);
  });

  it('AC6: the sixth request in an hour from one address is a 429 with no email', async () => {
    const ip = freshIp();
    for (let i = 0; i < 5; i++) expect((await post(VALID, { ip })).status).toBe(202);

    const response = await post(VALID, { ip });

    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ code: 'rate_limited' });
    expect(sent).toHaveLength(5);
  });

  it('AC6: another address is not limited by the first', async () => {
    const ip = freshIp();
    for (let i = 0; i < 6; i++) await post(VALID, { ip });

    expect((await post(VALID)).status).toBe(202);
  });

  it('AC6: a request with no usable client address counts against one shared limit, and a key never holds the address', async () => {
    const keys: string[] = [];
    const server = api({
      consumeRateLimit: (key) => {
        keys.push(key);
        return Promise.resolve({ allowed: true });
      },
    });

    await post(VALID, { ip: '', server });
    await post({ ...VALID }, { ip: 'not an address', server });
    await post(VALID, { ip: '203.0.113.9', server });
    await post(VALID, { ip: '203.0.113.10', server });

    const [none, invalid, one, other] = [keys[0], keys[2], keys[4], keys[6]];
    expect(none).toBe(invalid);
    expect(one).not.toBe(other);
    expect(none).not.toBe(one);
    expect(keys.join()).not.toContain('203.0.113');
  });

  it('AC6: a honeypot request does not count against the limit', async () => {
    const ip = freshIp();
    for (let i = 0; i < 10; i++) await post({ ...VALID, website: 'x' }, { ip });

    expect((await post(VALID, { ip })).status).toBe(202);
  });

  it('AC6: the whole form is limited too, so many addresses cannot flood the inbox', async () => {
    const limits: string[] = [];
    const server = api({
      consumeRateLimit: (key, rule) => {
        limits.push(`${key.split(':')[1]}:${rule.max}`);
        return Promise.resolve({ allowed: !key.includes(':all') });
      },
    });

    const response = await post(VALID, { server });

    expect(response.status).toBe(429);
    expect(limits).toEqual(['ip:5', 'all:60']);
    expect(sent).toHaveLength(0);
  });

  it('AC5: when the email cannot be sent the visitor gets an honest 503, nothing about it is logged, and it is reported', async () => {
    const logs = vi.spyOn(console, 'error').mockImplementation(() => {});
    const transport = createCaptureTransport();
    const errorReporter = createErrorReporter({
      env: { SENTRY_DSN: 'https://public@o0.ingest.de.sentry.io/1' },
      transport,
    });
    const failing = vi.fn(() => Promise.reject(new Error('lettermint: HTTP 422')));

    const response = await post(VALID, {
      server: api({ sendDemoRequest: failing, errorReporter }),
    });
    await errorReporter.flush();

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ code: 'unavailable' });
    expect(transport.events.length).toBeGreaterThan(0);
    const everything = JSON.stringify([transport.events, logs.mock.calls]);
    for (const secret of ['Anna', 'anna@example.com', 'roosters']) {
      expect(everything).not.toContain(secret);
    }
  });

  it('is public and in the contract with its answers', () => {
    const operation = contract.paths['/v1/demo-requests'].post;

    expect(operation.operationId).toBe('requestDemo');
    expect(operation['x-access']).toEqual({ type: 'public' });
    expect(Object.keys(operation.responses)).toEqual(['202', '400', '429', '500', '503']);
  });
});
