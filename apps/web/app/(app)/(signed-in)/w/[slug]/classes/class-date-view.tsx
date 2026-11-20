import { pickContentLanguage, type TrainerWordForms } from '@fivvi/i18n';
import { Card, CardContent } from '@fivvi/ui/components/card';
import { PageShell } from '@fivvi/ui/kit/page-shell';
import type { Route } from 'next';
import Link from 'next/link';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useSessionFormat } from '../sessions/use-session-format';
import type { Session } from './classes-client';
import { CopyBookingLink } from './copy-booking-link';
import { EditClassDate } from './edit-class-date';
import { orderedFields, referenceDay } from './series';

/**
 * CO-01 *Les op datum* (`/w/{slug}/classes/{classId}/{sessionId}`, F021): the title with the class
 * name in the viewer's language (else Dutch), the date and the start–end, the location, the trainer
 * or *Trainer nodig*, *{booked}/{capacity} geboekt* with the free spots, and *Nog geen boekingen.*
 * until bookings exist (M5). The Owner has **Wijzigen** (CO-04, this one date); the assigned
 * Trainer sees the page without those. Both have **Boekingslink kopiëren** on a class date that is
 * scheduled and has not started (F037).
 */
export function ClassDateView({
  workspaceId,
  slug,
  session,
  canManage,
  canCopyLink,
  ownDate,
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
  trainerWord: TrainerWordForms;
}) {
  const t = useTranslations('classes');
  const locale = useLocale();
  const format = useFormatter();
  const { longDay, time } = useSessionFormat(session.timeZone);
  const booked = session.participants.length;
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
        {canManage || canCopyLink ? (
          <div className="flex flex-wrap items-center gap-2">
            {canCopyLink ? (
              <CopyBookingLink workspaceId={workspaceId} sessionId={session.id} />
            ) : null}
            {canManage ? (
              <EditClassDate workspaceId={workspaceId} session={session} ownDate={ownDate} />
            ) : null}
          </div>
        ) : null}
      </div>
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
            <dt className="text-muted-foreground">{t('date.bookedLabel')}</dt>
            <dd>
              {t('date.booked', {
                booked,
                capacity: session.capacity,
                free: Math.max(0, session.capacity - booked),
              })}
            </dd>
          </dl>
          {booked === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">{t('date.noBookings')}</p>
          ) : null}
        </CardContent>
      </Card>
    </PageShell>
  );
}
