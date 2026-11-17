import { createHash } from 'node:crypto';

/**
 * A UUID built from a name, for the idempotency key of an email (F049): the first 128 bits of
 * the name's SHA-256 with the UUID version (5) and variant bits set, so the same name always gives
 * the same key, another name another key, and the key reveals nothing of what it was built from.
 * Not an RFC 4122 version 5 UUID (that hashes with SHA-1 and a namespace); only shaped like one,
 * which is what the email provider's key format asks for.
 */
export function uuidFromName(name: string): string {
  const bytes = createHash('sha256').update(name).digest().subarray(0, 16);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x50;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * The idempotency key of one email for one event (F049 AC11): built from the catalog ID of the
 * email (`EM-11`) and the event that caused it (the session and its version, the invitation and its
 * token), so sending the same email for the same event twice reaches the provider with one key and
 * goes out once, while another event or another email has a key of its own.
 */
export function emailIdempotencyKey(emailId: string, event: string): string {
  return uuidFromName(`${emailId}:${event}`);
}
