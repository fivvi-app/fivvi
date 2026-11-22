'use client';

import { Button } from '@fivvi/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@fivvi/ui/components/dialog';
import { useTranslations } from 'next-intl';

/** An empty moment of the calendar the Owner clicked or dragged over (WC-06). */
export interface Slot {
  /** `YYYY-MM-DD` and `HH:mm` in the workspace's time zone. */
  localDate: string;
  localStart: string;
  /** From a drag: the length of the selection, in minutes. */
  durationMinutes?: number;
  /** In the day view the column's trainer. */
  trainerId?: string;
}

/**
 * WC-06 *Nieuw op {datum}, {tijd}* (F014): what a click on an empty moment of the calendar asks:
 * *Privésessie* (PS-01 with the date, the start and, in the day view, the column's trainer filled
 * in) and *Groepsles* (F021's *Op een datum plannen* with the date and the start). The Owner's
 * only: a Trainer gets no menu. *Open Gym* comes with F034. `day` is the date as it is written
 * in the menu's title.
 */
export function SlotMenu({
  slot,
  day,
  onPrivate,
  onGroup,
  onClose,
}: {
  slot: Slot;
  day: string;
  onPrivate?: () => void;
  onGroup?: () => void;
  onClose: () => void;
}) {
  const t = useTranslations('workspaceCalendar');
  const nav = useTranslations('workspaceNav');
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="gap-0 rounded-[14px] p-5.5 sm:max-w-sm"
        // The form that opens next takes the focus; it is not for the grid to take it back.
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        <DialogHeader className="pb-4">
          <DialogTitle className="text-lg leading-snug font-semibold">
            {t('newAt', { date: day, time: slot.localStart })}
          </DialogTitle>
          <DialogDescription>{t('newAtHint')}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          {onPrivate ? (
            <Button type="button" variant="outline" className="justify-start" onClick={onPrivate}>
              {nav('newPrivateSession')}
            </Button>
          ) : null}
          {onGroup ? (
            <Button type="button" variant="outline" className="justify-start" onClick={onGroup}>
              {nav('newGroupClass')}
            </Button>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
