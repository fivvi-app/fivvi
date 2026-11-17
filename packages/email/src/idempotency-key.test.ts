import { describe, expect, it } from 'vitest';
import { emailIdempotencyKey, uuidFromName } from './idempotency-key.ts';

describe('uuidFromName', () => {
  it('is a UUID with the version 5 and variant bits, the same for the same name', () => {
    const key = uuidFromName('some:name');

    expect(key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(uuidFromName('some:name')).toBe(key);
  });

  it('gives another name another key and does not contain the name', () => {
    expect(uuidFromName('some:other-name')).not.toBe(uuidFromName('some:name'));
    expect(uuidFromName('abcdef00')).not.toContain('abcdef00');
  });
});

describe('F049 AC11 emailIdempotencyKey', () => {
  it('is built from the catalog ID and the event: the same pair gives the same key', () => {
    const key = emailIdempotencyKey('EM-11', 'session-1:1');

    expect(emailIdempotencyKey('EM-11', 'session-1:1')).toBe(key);
    expect(key).toBe(uuidFromName('EM-11:session-1:1'));
  });

  it('gives another event or another email another key', () => {
    const key = emailIdempotencyKey('EM-11', 'session-1:1');

    expect(emailIdempotencyKey('EM-11', 'session-1:2')).not.toBe(key);
    expect(emailIdempotencyKey('EM-04', 'session-1:1')).not.toBe(key);
  });
});
