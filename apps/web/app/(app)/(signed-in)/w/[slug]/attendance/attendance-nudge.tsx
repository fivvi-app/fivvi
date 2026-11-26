'use client';

import { SIGNED_IN_HOME } from '@fivvi/auth/return-path';
import { Button } from '@fivvi/ui/components/button';
import { ErrorLine } from '@fivvi/ui/kit/error-line';
import { WarningIcon } from '@fivvi/ui/kit/icons';
import type { Route } from 'next';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { type MarkableStatus, setAttendance } from './attendance-client';

/**
 * *Aanwezigheid nog invullen* on a session of *Mijn dag* that has ended with a participant still
 * *Geboekt* (F025, Q18; the API says so with `attendanceOpen`). A private session with one client
 * has the inline buttons *Aanwezig* and *Niet verschenen*: a tap saves and the nudge goes. A class
 * (or a duo) has the line as a link to its page, where each participant is filled in.
 */
export function AttendanceNudge({
  workspaceId,
  sessionId,
  href,
  client,
}: {
  workspaceId: string;
  sessionId: string;
  /** The session's page, where the attendance of a class is filled in. */
  href: string;
  /** The one client of a private session: the buttons set their attendance. */
  client?: { clientId: string; name: string };
}) {
  const t = useTranslations('attendance');
  const router = useRouter();
  const [done, setDone] = useState(false);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  // A tap before the page hydrates would do nothing.
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);

  if (done) return null;
  const line = (
    <span className="flex items-center gap-1.5 text-sm font-medium">
      <WarningIcon className="size-3.5 shrink-0" />
      {t('nudge')}
    </span>
  );
  if (!client) {
    return (
      <Link
        href={href as Route}
        className="flex min-h-11 items-center rounded-lg px-3 hover:bg-muted"
      >
        {line}
      </Link>
    );
  }

  async function mark(status: MarkableStatus) {
    if (pending || !client) return;
    setPending(true);
    setFailure(null);
    const result = await setAttendance(workspaceId, sessionId, client.clientId, status);
    setPending(false);
    if (result.ok) {
      setDone(true);
      return router.refresh();
    }
    if (result.reason === 'home') return window.location.replace(SIGNED_IN_HOME);
    // Cancelled meanwhile or not open yet: the server's page says which.
    if (result.reason === 'sessionCancelled' || result.reason === 'tooEarly') router.refresh();
    const message =
      result.reason === 'participantCancelled' || result.reason === 'noConnection'
        ? result.reason
        : 'generic';
    setFailure(t(`errors.${message}`));
  }

  return (
    <div className="grid gap-2 px-3 pb-1">
      {line}
      <fieldset className="flex flex-wrap gap-2">
        <legend className="sr-only">{t('nudgeFor', { name: client.name })}</legend>
        {(
          [
            ['attended', 'attended'],
            ['no_show', 'noShow'],
          ] as const
        ).map(([status, key]) => (
          <Button
            key={status}
            variant="outline"
            className="min-h-11"
            disabled={!ready}
            aria-label={t('nudgeButtonLabel', { status: t(`status.${key}`), name: client.name })}
            onClick={() => mark(status)}
          >
            {t(`status.${key}`)}
          </Button>
        ))}
      </fieldset>
      {failure ? <ErrorLine>{failure}</ErrorLine> : null}
    </div>
  );
}
