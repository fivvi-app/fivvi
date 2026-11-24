import type { Locale, TrainerWordForms } from '@fivvi/i18n';
import { Button } from '@fivvi/ui/components/button';
import { Card, CardContent } from '@fivvi/ui/components/card';
import type { Route } from 'next';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { AssignTrainer } from './assign-trainer';
import { SessionActions } from './session-actions';
import type { Session } from './sessions-client';
import { useSessionFormat } from './use-session-format';

/**
 * The session page (`/w/{slug}/sessions/{id}`, F020): the title *Privésessie met {klant}*, when
 * (the date and the start–end, in the workspace's time zone), where, who trains, and the client
 * with a link to their profile. The actions are *Verplaatsen* (PS-05, for a person who may plan
 * sessions; a cancelled session is not moved), *Annuleren* (PS-06, F026) and *Klantprofiel*. A
 * cancelled session shows "Geannuleerd op {date} om {time} door {name} · op verzoek van de klant"
 * and offers *Klantprofiel* only. The sections that belong to other
 * features (workout, attendance, notes) are not shown until those land.
 */
export function SessionView({
  workspaceId,
  slug,
  session,
  client,
  defaultLocale,
  canMove,
  teamMemberId,
  canCancel = false,
  startMoving = false,
  startCancelling = false,
  assign,
  trainerWord,
}: {
  workspaceId: string;
  slug: string;
  session: Session;
  /** The session's one client, with what moving it needs to word the email. */
  client: { id: string; name: string; email: string; emailLocale: Locale | null };
  defaultLocale: Locale;
  /** The person has `session.private.manage.own` or `.any`. */
  canMove: boolean;
  /**
   * The signed-in person's own team-member ID in the workspace. The trainer row reads *Jij* when
   * it is the session's trainer's ID, and PS-07 words the warning for themself; never by name.
   */
  teamMemberId: string;
  /** The person may cancel this session (F026): the Owner any, a Trainer their own. */
  canCancel?: boolean;
  /** PS-05 opens at once (the calendar's *Verplaatsen*). */
  startMoving?: boolean;
  /** PS-06 opens at once (the calendar's *Annuleren*). */
  startCancelling?: boolean;
  /**
   * The person may change the trainer (`session.assign`, the Owner, F023): *Trainer wijzigen*.
   * `startOpen` opens it at once (`?assign=1`: the calendar's quick view and *Aandacht nodig*).
   */
  assign?: { workspaceName: string; startOpen: boolean };
  trainerWord: TrainerWordForms;
}) {
  const t = useTranslations('sessions.page');
  const { day, longDay, time } = useSessionFormat(session.timeZone);
  const cancelled = session.status === 'cancelled';
  const ownSession = session.trainer?.id === teamMemberId;
  return (
    <main className="flex-1 px-6 pt-5 pb-10">
      <div className="grid max-w-275 content-start gap-4">
        <h1 className="min-w-0 text-[22px] font-semibold tracking-tight">
          {t('heading', { client: client.name })}
        </h1>
        {cancelled ? (
          <p className="text-sm font-semibold">
            {session.cancellation
              ? [
                  session.cancellation.cancelledBy
                    ? t('cancelledBanner', {
                        date: day(session.cancellation.cancelledAt),
                        time: time(session.cancellation.cancelledAt),
                        name: session.cancellation.cancelledBy.name,
                      })
                    : t('cancelledBannerUnknown', {
                        date: day(session.cancellation.cancelledAt),
                        time: time(session.cancellation.cancelledAt),
                      }),
                  session.cancellation.initiator === 'client' ? t('cancelledByClient') : undefined,
                ]
                  .filter(Boolean)
                  .join(' · ')
              : t('cancelled')}
          </p>
        ) : null}
        <Card>
          <CardContent>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
              <dt className="text-muted-foreground">{t('whenLabel')}</dt>
              <dd>
                {t('timeRange', {
                  date: longDay(session.startsAt),
                  start: time(session.startsAt),
                  end: time(session.endsAt),
                })}
              </dd>
              <dt className="text-muted-foreground">{t('whereLabel')}</dt>
              <dd>{session.location.name}</dd>
              <dt className="text-muted-foreground">{t('trainerLabel', { ...trainerWord })}</dt>
              <dd>
                {session.trainer
                  ? ownSession
                    ? t('you')
                    : session.trainer.name
                  : t('noTrainer', { ...trainerWord })}
              </dd>
              <dt className="text-muted-foreground">{t('clientLabel')}</dt>
              <dd>
                <Link
                  href={`/w/${slug}/clients/${client.id}` as Route}
                  className="underline underline-offset-4"
                >
                  {client.name}
                </Link>
              </dd>
            </dl>
          </CardContent>
        </Card>
        <div className="flex flex-wrap items-center gap-2">
          <SessionActions
            workspaceId={workspaceId}
            session={session}
            client={client}
            defaultLocale={defaultLocale}
            ownSession={ownSession}
            canMove={canMove}
            canCancel={canCancel}
            startMoving={startMoving}
            startCancelling={startCancelling}
          >
            {assign ? (
              <AssignTrainer
                workspaceId={workspaceId}
                slug={slug}
                session={session}
                client={{
                  name: client.name,
                  email: client.email,
                  emailLocale: client.emailLocale ?? defaultLocale,
                }}
                trainerWord={trainerWord}
                workspaceName={assign.workspaceName}
                teamMemberId={teamMemberId}
                startOpen={assign.startOpen}
              />
            ) : null}
          </SessionActions>
          <Button asChild variant="outline">
            <Link href={`/w/${slug}/clients/${client.id}` as Route}>{t('clientProfile')}</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
