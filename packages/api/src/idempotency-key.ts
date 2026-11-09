import { createHash } from 'node:crypto';

/**
 * A UUID built from a name, for the idempotency key of an email (F011, F020): the first 128 bits of
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
