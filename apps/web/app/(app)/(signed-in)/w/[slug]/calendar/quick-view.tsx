'use client';

import type { Schemas } from '@fivvi/contract';
import type { TrainerWordForms } from '@fivvi/i18n';
import { Button } from '@fivvi/ui/components/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@fivvi/ui/components/dialog';
import type { Route } from 'next';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';
import { useSessionFormat } from '../sessions/use-session-format';

export type CalendarItem = Schemas['WorkspaceCalendarSession'];

const WEEKDAYS = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'] as const;

/** What the person may do in the workspace: from their capabilities and their own place in it. */
export interface CalendarAccess {
  /** `session.private.manage.any`, or `.own` for the sessions where they are the trainer. */
  canMoveAny: boolean;
  canMoveOwn: boolean;
  canChangeClasses: boolean;
  canSeeClients: boolean;
  /** The signed-in person's own team-member ID: *Jij* and *own session*, never decided by name. */
  teamMemberId: string;
}

/**
 * WC-05 *Snelle weergave* (F014): the facts of one block and the actions that exist. A side panel
 * rather than a popover: Esc or *Sluiten* closes it and focus goes back to the block. A note is
 * never here: the API does not send one. A Trainer's own private session has the actions F020 gives
 * them; another trainer's session has *Openen* only.
 */
export function QuickView({
  item,
  slug,
  access,
  trainerWord,
  onClose,
  returnFocus,
}: {
  item: CalendarItem | null;
  slug: string;
  access: CalendarAccess;
  trainerWord: TrainerWordForms;
  onClose: () => void;
  /** Puts focus back on the block or row the quick view was opened from (there is no trigger to do it). */
  returnFocus: () => void;
}) {
  const t = useTranslations('workspaceCalendar');
  return (
    <Dialog open={item !== null} onOpenChange={(open) => !open && onClose()}>
      {item ? (
        <DialogContent
          aria-label={t('quickView')}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            returnFocus();
          }}
        >
          <QuickViewBody item={item} slug={slug} access={access} trainerWord={trainerWord} />
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

function QuickViewBody({
  item,
  slug,
  access,
  trainerWord,
}: {
  item: CalendarItem;
  slug: string;
  access: CalendarAccess;
  trainerWord: TrainerWordForms;
}) {
  const t = useTranslations('workspaceCalendar');
  const shared = useTranslations('myCalendar');
  const format = useFormatter();
  const when = useSessionFormat(item.timeZone);
  const isPrivate = item.type === 'private';
  const cancelled = item.status === 'cancelled';
  const own = item.trainer?.id === access.teamMemberId;
  const name = (isPrivate ? item.clientName : item.className) ?? '';
  const href = `/w/${slug}/sessions/${item.id}`;
  const client = item.clients?.[0];
  const weekday = item.series ? WEEKDAYS.indexOf(item.series.weekday) : -1;
  const free = Math.max(item.capacity - (item.booked ?? 0), 0);
  const movable = isPrivate && !cancelled && (access.canMoveAny || (access.canMoveOwn && own));
  return (
    <>
      <DialogHeader>
        <DialogTitle className={cancelled ? 'line-through' : undefined}>
          {shared('block', {
            type: isPrivate ? shared('typePrivate') : shared('typeGroup'),
            name,
          })}
        </DialogTitle>
        <DialogDescription>
          {t('when', {
            date: when.day(item.startsAt),
            start: when.time(item.startsAt),
            end: when.time(item.endsAt),
          })}
        </DialogDescription>
      </DialogHeader>
      <ul className="grid gap-1 text-sm">
        {cancelled ? <li className="font-medium">{shared('cancelled')}</li> : null}
        <li>
          {item.trainer
            ? t('trainerLine', { ...trainerWord, name: own ? t('you') : item.trainer.name })
            : t('noTrainerMark', { ...trainerWord })}
        </li>
        {isPrivate ? null : (
          <li>{t('bookedLine', { booked: item.booked ?? 0, capacity: item.capacity, free })}</li>
        )}
        <li>{item.location.name}</li>
        {item.series && weekday >= 0 ? (
          <li>
            {t('seriesLine', {
              weekday: format.dateTime(new Date(Date.UTC(2026, 0, 5 + weekday)), {
                timeZone: 'UTC',
                weekday: 'long',
              }),
              time: item.series.localStartTime,
            })}
            {item.series.changedFields.length > 0 ? ` · ${t('changedFromSeries')}` : null}
          </li>
        ) : null}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button asChild>
          <Link href={href as Route}>{t('open')}</Link>
        </Button>
        {movable ? (
          <Button asChild variant="outline">
            <Link href={`${href}?move=1` as Route}>{t('move')}</Link>
          </Button>
        ) : null}
        {!isPrivate && !cancelled && access.canChangeClasses ? (
          <Button asChild variant="outline">
            <Link href={href as Route}>{t('change')}</Link>
          </Button>
        ) : null}
        {isPrivate && client && access.canSeeClients ? (
          <Button asChild variant="outline">
            <Link href={`/w/${slug}/clients/${client.clientId}` as Route}>
              {t('clientProfile')}
            </Link>
          </Button>
        ) : null}
        <DialogClose asChild>
          <Button variant="ghost">{t('close')}</Button>
        </DialogClose>
      </div>
    </>
  );
}
