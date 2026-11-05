import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createInvitationToken, hashInvitationToken, invitationIdempotencyKey } from './token.ts';

describe('F011 invitation token', () => {
  it('AC10: is random, at least 128 bits, and safe in a link', () => {
    const tokens = Array.from({ length: 50 }, () => createInvitationToken().token);

    expect(new Set(tokens).size).toBe(50);
    for (const token of tokens) {
      // base64url of 32 random bytes (256 bits): 43 characters, no padding.
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(Buffer.from(token, 'base64url').length * 8).toBeGreaterThanOrEqual(128);
    }
  });

  it('AC10: is stored as its hash: a hex SHA-256 of the token that is not the token', () => {
    const { token, hash } = createInvitationToken();

    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).toBe(hashInvitationToken(token));
    expect(hash).not.toContain(token);
    // SHA-256 of the token's text, so the hash is the same on every machine and release.
    expect(hashInvitationToken('abc')).toBe(createHash('sha256').update('abc').digest('hex'));
  });

  it('AC7: another token has another hash', () => {
    expect(createInvitationToken().hash).not.toBe(createInvitationToken().hash);
  });

  it('AC1: the idempotency key of a send is a UUID of the invitation and its token', () => {
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
    const key = invitationIdempotencyKey('invitation-1', 'hash-1');

    expect(key).toMatch(uuid);
    expect(invitationIdempotencyKey('invitation-1', 'hash-1')).toBe(key);
    expect(invitationIdempotencyKey('invitation-1', 'hash-2')).not.toBe(key);
    expect(invitationIdempotencyKey('invitation-2', 'hash-1')).not.toBe(key);
  });
});
