/**
 * The event behind the email of one session at one version (F020, F049): the same session at the
 * same version sent twice has one event, so the email reaches the provider with one idempotency key
 * (built from the catalog ID, EM-11 or EM-04, and this event) and goes out once, while a change
 * that raises the version (a reschedule, EM-04) has an event of its own.
 */
export function privateSessionEmailEvent(sessionId: string, version: number): string {
  return `${sessionId}:${version}`;
}
