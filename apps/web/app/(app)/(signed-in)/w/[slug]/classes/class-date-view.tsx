import { pickContentLanguage, type TrainerWordForms } from '@fivvi/i18n';
import { Card, CardContent } from '@fivvi/ui/components/card';
import { PageShell } from '@fivvi/ui/kit/page-shell';
import type { Route } from 'next';
import Link from 'next/link';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { AssignTrainer } from '../sessions/assign-trainer';
import { useSessionFormat } from '../sessions/use-session-format';
import { CancelClass } from './cancel-class';
import { ClassLevelIcon } from './class-level';
import type { Session } from './classes-client';
import { CopyBookingLink } from './copy-booking-link';
import { EditClassDate } from './edit-class-date';
import { orderedFields, referenceDay } from './series';

/**
 * CO-01 *Les op datum* (`/w/{slug}/classes/{classId}/{sessionId}`, F021): the title with the class
 * name in the viewer's language (else Dutch), the date and the start–end, the location, the trainer
 * or *Trainer nodig*, the *Niveau* with its icon and word unless it is *Geen* (F067), *{booked}/{capacity} geboekt* with the free spots, and *Nog geen boekingen.*
 * until bookings exist (M5). The Owner has **Wijzigen** (CO-04, this one date); the assigned
 * Trainer sees the page without those. The Owner also has **Les annuleren** (CO-03, F026); a
 * cancelled date shows "Geannuleerd op {date} om {time} door {name}", its cancelled participants
 * under *Geannuleerd* and no actions. Both have **Boekingslink kopiëren** on a class date that is
 * scheduled and has not started (F037).
 */
export function ClassDateView({
  workspaceId,
  slug,
  session,
  canManage,
  canCopyLink,
  ownDate,
  startEditing = false,
  startCancelling = false,
  assign,
  trainerWord,
}: {
  workspaceId: string;
  slug: string;
  session: Session;
  /** The person has `class.manage`. */
  canManage: boolean;
  /** The person has `booking_link.copy` and the date offers a link (scheduled, not started): *Boekingslink kopiëren* (F037). */
  canCopyLink: boolean;
  /** The date's trainer is the signed-in person: PS-07 says "Je hebt dan al iets". */
  ownDate: boolean;
  /** CO-04 opens at once (`?edit=1`, the calendar's *Wijzigen*), for the Owner. */
  startEditing?: boolean;
  /** CO-03 opens at once (`?cancel=1`, the calendar's *Les annuleren*), for the Owner. */
  startCancelling?: boolean;
  /**
   * The person may assign trainers (`session.assign`, the Owner, F023): *Trainer toewijzen* /
   * *Trainer vervangen* (CO-02). `startOpen` opens it at once (`?assign=1`: the calendar's quick
   * view and *Aandacht nodig*).
   */
  assign?: { workspaceName: string; teamMemberId: string; startOpen: boolean };
  trainerWord: TrainerWordForms;
}) {
  const t = useTranslations('classes');
  const levelCopy = useTranslations('classLevel');
  const locale = useLocale();
  const format = useFormatter();
  const { day, longDay, time } = useSessionFormat(session.timeZone);
  const cancelled = session.status === 'cancelled';
  // A cancelled participant is listed under *Geannuleerd*; the places are those still booked.
  const active = session.participants.filter(
    ({ attendanceStatus }) => attendanceStatus !== 'cancelled',
  );
  const cancelledParticipants = session.participants.filter(
    ({ attendanceStatus }) => attendanceStatus === 'cancelled',
  );
  const booked = active.length;
  const name = session.groupClass
    ? pickContentLanguage(locale, session.groupClass.nameNl, session.groupClass.nameEn)
    : '';
  const series = session.series;
  return (
    <PageShell>
      {canManage ? (
        <Link
          href={`/w/${slug}/classes` as Route}
          className="text-sm text-muted-foreground underline underline-offset-4"
        >
          {t('date.back')}
        </Link>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="min-w-0 text-[22px] font-semibold tracking-tight">{name}</h1>
        {canManage || canCopyLink || assign ? (
          <div className="flex flex-wrap items-center gap-2">
            {canCopyLink ? (
              <CopyBookingLink workspaceId={workspaceId} sessionId={session.id} />
            ) : null}
            {assign ? (
              <AssignTrainer
                workspaceId={workspaceId}
                slug={slug}
                session={session}
                trainerWord={trainerWord}
                workspaceName={assign.workspaceName}
                teamMemberId={assign.teamMemberId}
                startOpen={assign.startOpen}
              />
            ) : null}
            {canManage && !cancelled ? (
              <EditClassDate
                workspaceId={workspaceId}
                session={session}
                ownDate={ownDate}
                startOpen={startEditing}
              />
            ) : null}
            {canManage ? (
              <CancelClass
                workspaceId={workspaceId}
                session={session}
                startOpen={startCancelling}
              />
            ) : null}
          </div>
        ) : null}
      </div>
      {cancelled && session.cancellation ? (
        <p className="text-sm font-semibold">
          {session.cancellation.cancelledBy
            ? t('date.cancelledBanner', {
                date: day(session.cancellation.cancelledAt),
                time: time(session.cancellation.cancelledAt),
                name: session.cancellation.cancelledBy.name,
              })
            : t('date.cancelledBannerUnknown', {
                date: day(session.cancellation.cancelledAt),
                time: time(session.cancellation.cancelledAt),
              })}
        </p>
      ) : null}
      {series ? (
        <div className="grid gap-1 text-sm">
          <p>
            {t('date.seriesLine', {
              name,
              weekday: format.dateTime(referenceDay(series.weekday), {
                timeZone: 'UTC',
                weekday: 'long',
              }),
              time: series.localStartTime,
            })}
          </p>
          {series.changedFields.length > 0 ? (
            <p className="text-muted-foreground">
              {t('date.changedFromSeries', {
                fields: orderedFields(series.changedFields)
                  // The fields read as a list in the middle of a sentence: *tijd, trainer*.
                  .map((field) =>
                    t(`date.changedField.${field}`, { ...trainerWord }).toLocaleLowerCase(locale),
                  )
                  .join(', '),
              })}
            </p>
          ) : null}
        </div>
      ) : null}
      <Card>
        <CardContent>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
            <dt className="text-muted-foreground">{t('date.whenLabel')}</dt>
            <dd>
              {t('date.timeRange', {
                date: longDay(session.startsAt),
                start: time(session.startsAt),
                end: time(session.endsAt),
              })}
            </dd>
            <dt className="text-muted-foreground">{t('date.whereLabel')}</dt>
            <dd>{session.location.name}</dd>
            <dt className="text-muted-foreground">{t('date.trainerLabel', { ...trainerWord })}</dt>
            <dd>
              {session.trainer ? session.trainer.name : t('trainerNeeded', { ...trainerWord })}
            </dd>
            {session.level ? (
              <>
                <dt className="text-muted-foreground">{levelCopy('field')}</dt>
                <dd>
                  <ClassLevelIcon level={session.level} />
                </dd>
              </>
            ) : null}
            {cancelled ? null : (
              <>
                <dt className="text-muted-foreground">{t('date.bookedLabel')}</dt>
                <dd>
                  {t('date.booked', {
                    booked,
                    capacity: session.capacity,
                    free: Math.max(0, session.capacity - booked),
                  })}
                </dd>
              </>
            )}
          </dl>
          {booked === 0 && !cancelled ? (
            <p className="mt-3 text-sm text-muted-foreground">{t('date.noBookings')}</p>
          ) : null}
          {cancelledParticipants.length > 0 && session.cancellation ? (
            <div className="mt-3 grid gap-1 text-sm">
              <h2 className="font-semibold">{t('date.cancelledSection')}</h2>
              <ul className="grid gap-0.5">
                {cancelledParticipants.map((participant) => (
                  <li key={participant.clientId}>
                    {t('date.cancelledParticipant', {
                      name: participant.name,
                      date: day(session.cancellation?.cancelledAt ?? session.startsAt),
                      time: time(session.cancellation?.cancelledAt ?? session.startsAt),
                    })}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </PageShell>
  );
}
