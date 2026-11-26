'use client';

import { Button } from '@fivvi/ui/components/button';
import type { Route } from 'next';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import { useSessionFormat } from '../sessions/use-session-format';

/**
 * The row of *Aandacht nodig* on the Owner's Dashboard (WC-01, F025 AC11): "{n} sessies van gisteren
 * zonder aanwezigheid", with *Invullen* that expands it into those sessions, each linking to its
 * session page (CO-01 for a class date). The API lists them (`needsAttendance`) and drops a session
 * once every participant is filled in; this only words and links them.
 */
export function NeedsAttendance({
  sessions,
  slug,
  timeZone,
}: {
  /** In the API's time order; `name` is the dashboard's wording of the block ("Privé · Anna", "Kracht"). */
  sessions: { id: string; startsAt: string; name: string }[];
  slug: string;
  timeZone: string;
}) {
  const t = useTranslations('attendance');
  const when = useSessionFormat(timeZone);
  const [open, setOpen] = useState(false);
  const listId = useId();
  return (
    <li className="grid gap-2">
      <span className="flex flex-wrap items-center justify-between gap-2">
        <span className="min-w-0 text-sm">{t('needs', { count: sessions.length })}</span>
        <Button
          variant="outline"
          aria-expanded={open}
          aria-controls={listId}
          onClick={() => setOpen(!open)}
        >
          {t('fillIn')}
        </Button>
      </span>
      <ul id={listId} hidden={!open} aria-label={t('needsList')} className="grid gap-1 ps-3">
        {sessions.map((session) => (
          <li key={session.id}>
            <Link
              href={`/w/${slug}/sessions/${session.id}` as Route}
              className="inline-flex min-h-11 items-center text-sm underline underline-offset-4 md:min-h-6"
            >
              {t('needsItem', {
                name: session.name,
                date: when.day(session.startsAt),
                time: when.time(session.startsAt),
              })}
            </Link>
          </li>
        ))}
      </ul>
    </li>
  );
}
