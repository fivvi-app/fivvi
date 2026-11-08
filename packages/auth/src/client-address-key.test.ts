import { describe, expect, it } from 'vitest';
import { hashSecretValue } from './hash.ts';
import { clientAddressKey } from './rate-limit.ts';

const secret = 'test-secret-that-is-at-least-thirty-two-characters-long';
const key = (ip: string | undefined, requireClientIp = true, s = secret) =>
  clientAddressKey(s, new Headers(ip === undefined ? {} : { 'x-real-ip': ip }), requireClientIp);

describe('F064 the rate-limit key of a client address (the demo form)', () => {
  it('is a keyed hash: the same address under another secret is another key, and the address is not in it', () => {
    const one = key('203.0.113.9');

    expect(one).toMatch(/^[0-9a-f]{64}$/);
    expect(one).not.toContain('203.0.113');
    expect(one).not.toBe(key('203.0.113.9', true, `${secret}-other`));
  });

  it('is the same for the same address and differs between addresses', () => {
    expect(key('203.0.113.9')).toBe(key('203.0.113.9'));
    expect(key('203.0.113.9')).not.toBe(key('203.0.113.10'));
  });

  it('groups IPv6 addresses by /64, as sign-in does: one host owns a whole /64', () => {
    expect(key('2001:db8:1:2::1')).toBe(key('2001:db8:1:2:ffff:ffff:ffff:ffff'));
    expect(key('2001:db8:1:2::1')).not.toBe(key('2001:db8:1:3::1'));
  });

  it('is not the hash sign-in keys the same address by (another purpose)', () => {
    expect(key('203.0.113.9')).not.toBe(hashSecretValue(secret, 'rate-limit-ip', '203.0.113.9'));
  });

  it('puts a request with no usable address in one shared bucket when a proxy always sets it', () => {
    expect(key(undefined)).toBe(key('not an address'));
    expect(key(undefined)).toBe(key('1.2.3.4, 5.6.7.8'));
    expect(key(undefined)).not.toBe(key('203.0.113.9'));
    expect(key(undefined)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is no key at all without a usable address when no proxy is in front (local, tests)', () => {
    expect(key(undefined, false)).toBeNull();
    expect(key('not an address', false)).toBeNull();
    expect(key('203.0.113.9', false)).not.toBeNull();
  });
});
