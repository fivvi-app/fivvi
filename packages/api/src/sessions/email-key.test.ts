import { describe, expect, it } from 'vitest';
import { privateSessionEmailKey } from './email-key.ts';

describe('F020 EM-11 idempotency key', () => {
  it('is the same for the same session and version, another for a new version or session', () => {
    const key = privateSessionEmailKey('session-1', 1);

    expect(key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(privateSessionEmailKey('session-1', 1)).toBe(key);
    expect(privateSessionEmailKey('session-1', 2)).not.toBe(key);
    expect(privateSessionEmailKey('session-2', 1)).not.toBe(key);
  });
});
