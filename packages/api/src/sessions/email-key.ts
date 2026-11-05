import { createHash } from 'node:crypto';

/**
 * The idempotency key of EM-11 for one session at one version (F020): the same session at the same
 * version sent twice reaches the provider with one key and goes out once, while a change that
 * raises the version (a reschedule, EM-04) has a key of its own. A name-based UUID (version 5
 * layout) of the session ID and the version, so the key reveals neither.
 */
export function privateSessionEmailKey(sessionId: string, version: number): string {
  const bytes = createHash('sha256')
    .update(`private-session:${sessionId}:${version}`)
    .digest()
    .subarray(0, 16);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x50;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
