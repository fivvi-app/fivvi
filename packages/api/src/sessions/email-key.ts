import { uuidFromName } from '../idempotency-key.ts';

/**
 * The idempotency key of EM-11 for one session at one version (F020): the same session at the same
 * version sent twice reaches the provider with one key and goes out once, while a change that
 * raises the version (a reschedule, EM-04) has a key of its own. Built from the session ID and the
 * version, so the key reveals neither.
 */
export function privateSessionEmailKey(sessionId: string, version: number): string {
  return uuidFromName(`private-session:${sessionId}:${version}`);
}
