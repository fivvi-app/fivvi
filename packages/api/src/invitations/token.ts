import { createHash, randomBytes } from 'node:crypto';

// The token in the link of a trainer invitation (F011 AC10). Random and long, so it cannot be
// guessed, and stored only as a hash, so a leaked table opens nothing. It is never logged,
// reported or recorded as an event: it is in the email and nowhere else.

/** Bytes of randomness in a token: 256 bits, twice the 128 the spec asks for. */
const TOKEN_BYTES = 32;

/** The hash that is stored and looked up: SHA-256 as hex. A token of 256 random bits needs no salt or slow hash. */
export function hashInvitationToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** A new token for a link, and the hash to store for it. */
export function createInvitationToken(): { token: string; hash: string } {
  const token = randomBytes(TOKEN_BYTES).toString('base64url');
  return { token, hash: hashInvitationToken(token) };
}

/**
 * The idempotency key of the email of one invitation with one token (F011): the same invitation
 * with the same token sent twice reaches the provider with one key and goes out once, while a
 * resend, which rotates the token, has a key of its own. A name-based UUID (version 5 layout) of
 * the invitation ID and the token's hash, so the key reveals nothing of the token.
 */
export function invitationIdempotencyKey(invitationId: string, tokenHash: string): string {
  const bytes = createHash('sha256')
    .update(`${invitationId}:${tokenHash}`)
    .digest()
    .subarray(0, 16);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x50;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
