import type { Locale, TrainerWordForms } from '@fivvi/i18n';
import { Button } from '@fivvi/ui/components/button';
import { Card, CardContent } from '@fivvi/ui/components/card';
import type { Route } from 'next';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { RescheduleSession } from './reschedule-session';
import type { Session } from './sessions-client';
import { useSessionFormat } from './use-session-format';

/**
 * The session page (`/w/{slug}/sessions/{id}`, F020): the title *Privésessie met {klant}*, when
 * (the date and the start–end, in the workspace's time zone), where, who trains, and the client
 * with a link to their profile. The actions are *Verplaatsen* (PS-05, for a person who may plan
 * sessions; a cancelled session is not moved) and *Klantprofiel*. The sections that belong to other
 * features (workout, attendance, notes) are not shown until those land.
 */
export function SessionView({
  workspaceId,
  slug,
  session,
  client,
  defaultLocale,
  canMove,
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
  trainerWord: TrainerWordForms;
}) {
  const t = useTranslations('sessions.page');
  const { longDay, time } = useSessionFormat(session.timeZone);
  const cancelled = session.status === 'cancelled';
  return (
    <main className="flex-1 px-6 pt-5 pb-10">
      <div className="grid max-w-275 content-start gap-4">
        <h1 className="min-w-0 text-[22px] font-semibold tracking-tight">
          {t('heading', { client: client.name })}
        </h1>
        {cancelled ? <p className="text-sm font-semibold">{t('cancelled')}</p> : null}
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
              <dd>{session.trainer ? session.trainer.name : t('noTrainer', { ...trainerWord })}</dd>
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
          {canMove && !cancelled ? (
            <RescheduleSession
              workspaceId={workspaceId}
              session={session}
              client={client}
              defaultLocale={defaultLocale}
            />
          ) : null}
          <Button asChild variant="outline">
            <Link href={`/w/${slug}/clients/${client.id}` as Route}>{t('clientProfile')}</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
