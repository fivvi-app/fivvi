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
 * The event behind the email of one invitation with one token (F011, F049): the same invitation
 * with the same token sent twice has one event, so the email reaches the provider with one
 * idempotency key (built from EM-09 and this event) and goes out once, while a resend, which
 * rotates the token, has an event of its own. Built from the invitation ID and the token's hash,
 * never the token, and the key made of it reveals neither.
 */
export function invitationEmailEvent(invitationId: string, tokenHash: string): string {
  return `${invitationId}:${tokenHash}`;
}
