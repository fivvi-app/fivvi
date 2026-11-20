'use client';

import { pickContentLanguage } from '@fivvi/i18n';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@fivvi/ui/components/alert-dialog';
import { useLocale, useTranslations } from 'next-intl';
import type { TrainerConflictItem } from './sessions-client';
import { useSessionFormat } from './use-session-format';

/** What PS-07 shows: the sessions the API found, and whose they are. */
export interface DoubleBooking {
  conflicts: TrainerConflictItem[];
  /** The trainer's name; `null` when the person plans for themself ("Je hebt dan al iets"). */
  trainerName: string | null;
}

/**
 * PS-07 *Dubbele boeking* (F023 AC5, AC6): the soft warning after a save the API answered with `409`
 * `trainer_conflict`. The API finds the overlaps (the form has no rule of its own, AC7); this words
 * them: "{trainer} heeft dan al iets", or "Je hebt dan al iets" when the person plans for themself,
 * then one line per session. *Terug* (also Escape) closes it and keeps the form as it was;
 * *Toch opslaan* sends the same request again with `allowConflicts`, and the dialog stays until the
 * answer is in. It never blocks: the person decides.
 */
export function DoubleBookingDialog({
  doubleBooking,
  timeZone,
  pending,
  onBack,
  onSaveAnyway,
}: {
  doubleBooking: DoubleBooking | null;
  /** The workspace's time zone: the lines are written in it. */
  timeZone: string;
  /** *Toch opslaan* is on its way. */
  pending: boolean;
  onBack: () => void;
  onSaveAnyway: () => void;
}) {
  const t = useTranslations('sessions.doubleBooking');
  const locale = useLocale();
  const { day, time } = useSessionFormat(timeZone);
  const typeKey = { private: 'typePrivate', group: 'typeGroup', open_gym: 'typeOpenGym' } as const;

  return (
    <AlertDialog
      open={doubleBooking !== null}
      onOpenChange={(open) => !open && !pending && onBack()}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {doubleBooking?.trainerName
              ? t('title', { trainer: doubleBooking.trainerName })
              : t('titleOwn')}
          </AlertDialogTitle>
          {/* The note and the lines are the description: a screen reader announces the overlaps. */}
          <AlertDialogDescription asChild>
            <div>
              <p>{t('note')}</p>
              <ul className="mt-3 grid gap-1 text-foreground">
                {doubleBooking?.conflicts.map((item) => (
                  <li key={item.sessionId}>
                    {t('item', {
                      date: day(item.startsAt),
                      start: time(item.startsAt),
                      end: time(item.endsAt),
                      name: pickContentLanguage(locale, item.displayName, item.displayNameEn),
                      type: t(typeKey[item.type]),
                    })}
                  </li>
                ))}
              </ul>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>{t('back')}</AlertDialogCancel>
          <AlertDialogAction
            disabled={pending}
            onClick={(event) => {
              // The dialog stays until the answer is in: the form closes it, or shows what failed.
              event.preventDefault();
              onSaveAnyway();
            }}
          >
            {t('saveAnyway')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
