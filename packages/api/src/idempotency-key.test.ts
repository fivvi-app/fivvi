import { describe, expect, it } from 'vitest';
import { uuidFromName } from './idempotency-key.ts';

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
