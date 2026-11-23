import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { DatabaseExecutor } from './client.ts';
import {
  clients,
  sessionParticipantStatusChanges,
  sessionParticipants,
  sessions,
} from './schema/index.ts';

/**
 * Class participants and their attendance for the seeded week (F025, spec #460, AC17), so the
 * attendance screens of the web and both apps have class dates with people on them in the demo (M4
 * has no bookings: a class date has participants only from here and from the test helper
 * `addParticipants`). Never in production: `seed` returns first there.
 *
 * Each class date of the workspace that has no participant yet gets 3 to 8 of its clients, all
 * `booked` (the number follows the date's place in the week, within the date's capacity and the
 * clients there are), each with the first line of its status history (`null → booked`, by the
 * system, a week before the date). Then, for the dates that are over at `now` (their end is past):
 * attendance is marked as a trainer would, every fourth participant *Niet verschenen*, the rest
 * *Aanwezig*, each a history line a few minutes after the start. A cancelled date keeps its
 * participants as cancelled by the workspace (the cancellation is F026's; the seed sets the state it
 * leaves). A date that has participants already (the seed's earlier run, or an Owner's work) is left
 * as it is, so a run never changes what attendance was taken since.
 *
 * Synthetic: the clients are the seeded ones, with `@example.com` addresses.
 */
export async function seedClassAttendance(
  db: DatabaseExecutor,
  { workspaceId, now }: { workspaceId: string; now: Date },
): Promise<void> {
  const people = await db
    .select({ id: clients.id })
    .from(clients)
    .where(eq(clients.organizationId, workspaceId))
    .orderBy(asc(clients.email));
  if (people.length === 0) return;
  const dates = await db
    .select({
      id: sessions.id,
      status: sessions.status,
      startsAt: sessions.startsAt,
      endsAt: sessions.endsAt,
      capacity: sessions.capacity,
    })
    .from(sessions)
    .where(and(eq(sessions.organizationId, workspaceId), eq(sessions.type, 'group')))
    .orderBy(asc(sessions.startsAt), asc(sessions.id));
  if (dates.length === 0) return;
  const taken = new Set(
    (
      await db
        .select({ sessionId: sessionParticipants.sessionId })
        .from(sessionParticipants)
        .where(
          and(
            eq(sessionParticipants.organizationId, workspaceId),
            inArray(
              sessionParticipants.sessionId,
              dates.map((date) => date.id),
            ),
          ),
        )
    ).map((row) => row.sessionId),
  );

  const DAY = 24 * 60 * 60 * 1000;
  for (const [index, date] of dates.entries()) {
    if (taken.has(date.id)) continue;
    const count = Math.min(3 + (index % 6), date.capacity, people.length);
    // Another group of clients on each date, wrapping round the clients there are.
    const group = Array.from(
      { length: count },
      (_, place) => people[(index + place) % people.length],
    );
    for (const [place, person] of group.entries()) {
      if (!person) continue;
      const cancelled = date.status === 'cancelled';
      const over = !cancelled && date.endsAt.getTime() < now.getTime();
      const noShow = over && place % 4 === 3;
      const status = cancelled ? 'cancelled' : over ? (noShow ? 'no_show' : 'attended') : 'booked';
      const changedAt = cancelled
        ? new Date(date.startsAt.getTime() - DAY)
        : new Date(date.startsAt.getTime() + 5 * 60_000);
      const [participant] = await db
        .insert(sessionParticipants)
        .values({
          organizationId: workspaceId,
          sessionId: date.id,
          clientId: person.id,
          attendanceStatus: status,
          statusChangedAt: status === 'booked' ? null : changedAt,
          // In the order of the group, also inside one transaction (where `now()` does not move).
          createdAt: sql`clock_timestamp()`,
        })
        .returning({ id: sessionParticipants.id });
      if (!participant) throw new Error('The seed did not store a participant.');
      const line = {
        organizationId: workspaceId,
        sessionParticipantId: participant.id,
        clientId: person.id,
        actorType: 'system' as const,
        source: 'system' as const,
      };
      // The place was made a week before the date.
      await db.insert(sessionParticipantStatusChanges).values({
        ...line,
        fromStatus: null,
        toStatus: 'booked',
        changedAt: new Date(date.startsAt.getTime() - 7 * DAY),
      });
      if (status !== 'booked') {
        await db.insert(sessionParticipantStatusChanges).values({
          ...line,
          fromStatus: 'booked',
          toStatus: status,
          changedAt,
          initiatedBy: cancelled ? 'workspace' : null,
        });
      }
    }
  }
}
