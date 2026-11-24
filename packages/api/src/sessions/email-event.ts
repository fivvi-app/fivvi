/**
 * The event behind the email of one session at one version (F020, F049): the same session at the
 * same version sent twice has one event, so the email reaches the provider with one idempotency key
 * (built from the catalog ID, EM-11 or EM-04, and this event) and goes out once, while a change
 * that raises the version (a reschedule, EM-04) has an event of its own. Each client of a duo
 * (F066) has an event of their own too, so each gets the email once; a one-client session passes
 * no client and keeps the event it always had.
 */
export function privateSessionEmailEvent(
  sessionId: string,
  version: number,
  clientId?: string,
): string {
  return clientId === undefined ? `${sessionId}:${version}` : `${sessionId}:${version}:${clientId}`;
}

/**
 * The event behind the trainer-change email (EM-13, F023) to one client: the new trainer, the
 * client and every date the email lists, each with the version it has after the change. The same
 * change sent twice has one event, so the email reaches the provider with one idempotency key and
 * goes out once; another trainer, another client or another change (a version raised again) has a
 * key of its own. A client's dates are listed in the order they start.
 */
export function trainerChangeEmailEvent(
  newTrainerTeamMemberId: string,
  clientId: string,
  dates: readonly { sessionId: string; version: number }[],
): string {
  const listed = dates.map(({ sessionId, version }) => `${sessionId}:${version}`).join(',');
  return `trainer:${newTrainerTeamMemberId}:${clientId}:${listed}`;
}

/**
 * The event behind the EM-05 email of one class date at one version to one participant (F026): the
 * same key as a private session's (`privateSessionEmailEvent`), so the idempotency keys do not
 * change; a class date always names the client, since every participant has their own email.
 */
export function classDateEmailEvent(sessionId: string, version: number, clientId: string): string {
  return privateSessionEmailEvent(sessionId, version, clientId);
}
