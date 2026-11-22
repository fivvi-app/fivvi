'use client';

import { SIGNED_IN_HOME } from '@fivvi/auth/return-path';
import { Button } from '@fivvi/ui/components/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@fivvi/ui/components/dialog';
import { ErrorLine } from '@fivvi/ui/kit/error-line';
import { useFormatter, useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';
import { editClassDate } from '../classes/classes-client';
import { type DoubleBooking, DoubleBookingDialog } from '../sessions/double-booking';
import { reschedulePrivateSession, type TrainerConflictItem } from '../sessions/sessions-client';
import type { MoveProposal } from './calendar-moves';
import type { CalendarItem } from './quick-view';

/** What the calendar does once the dialog is done: the move was saved, or the item had changed meanwhile. */
export interface MoveOutcome {
  /** The new day and start, as the wall clock of the workspace. */
  moved: (to: { date: string; time: string }) => void;
  /** A stale version (409): who changed it, when known; the calendar reloads the week. */
  changed: (by: string | null, cancelled: boolean) => void;
}

type Failure =
  | 'noPermission'
  | 'notSaved'
  | { text: 'sessions.form' | 'classes.edit'; key: string };

type Written =
  | { kind: 'moved' }
  | { kind: 'home' }
  | { kind: 'changed'; by: string | null; cancelled: boolean }
  | { kind: 'trainerConflict'; conflicts: TrainerConflictItem[] }
  | { kind: 'failed'; failure: Failure };

/** The refusals both writes share: PS-07's warning, a person who may not, no way home, no connection. */
function refused(
  result:
    | { reason: 'trainerConflict'; conflicts: TrainerConflictItem[] }
    | { reason: 'forbidden' | 'home' | 'noConnection' | 'generic' | 'conflict' | 'fields' },
): Written {
  if (result.reason === 'trainerConflict' && 'conflicts' in result) {
    return { kind: 'trainerConflict', conflicts: result.conflicts };
  }
  if (result.reason === 'home') return { kind: 'home' };
  return { kind: 'failed', failure: result.reason === 'forbidden' ? 'noPermission' : 'notSaved' };
}

/**
 * WC-07 *{name} verplaatsen?* (F014): what dropping a block on another time asks. Nothing moves by
 * the drop alone: this dialog shows *{oud} → {nieuw}*, for a date in a series *Alleen deze les* /
 * *Deze en alle volgende lessen* (F022's scope), *{client} informeren per e-mail* for a private
 * session (F020's EM-04, on for a time still to come), and *Terug* / *Verplaatsen*. *Verplaatsen*
 * is F020's reschedule (private) or F022's date edit (class date): no write of its own, and the API
 * applies every rule. A time in the past warns for a private session; a class with bookings can't
 * go there. A stale version answers 409 and the calendar says who changed the item.
 */
export function MoveDialog({
  workspaceId,
  item,
  proposal,
  name,
  timeZone,
  ownSession,
  outcome,
  onClose,
}: {
  workspaceId: string;
  item: CalendarItem & { type: 'private' | 'group' };
  proposal: Extract<MoveProposal, { ok: true }>;
  /** The client of a private session, the class of a date. */
  name: string;
  timeZone: string;
  /** The signed-in person is the item's trainer: PS-07 says "Je hebt dan al iets". */
  ownSession: boolean;
  outcome: MoveOutcome;
  onClose: () => void;
}) {
  const t = useTranslations('workspaceCalendar');
  const edit = useTranslations('classes.edit');
  const editErrors = useTranslations('classes.edit.errors');
  const formErrors = useTranslations('sessions.form.errors');
  const reschedule = useTranslations('sessions.reschedule');
  const format = useFormatter();
  const [scope, setScope] = useState<'this' | 'following'>('this');
  const [notify, setNotify] = useState(!proposal.past);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [pending, setPending] = useState(false);
  // PS-07: the sessions the trainer already has at the new time; *Terug* keeps the dialog.
  const [doubleBooking, setDoubleBooking] = useState<DoubleBooking | null>(null);

  const place = ({ date, time }: { date: string; time: string }) =>
    `${format.dateTime(new Date(`${date}T12:00:00Z`), {
      timeZone: 'UTC',
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    })} ${time}`;
  const isPrivate = item.type === 'private';
  const blocked = !isPrivate && proposal.past && (item.booked ?? 0) > 0;

  /** The two writes answer in their own words; this is what the dialog does with either. */
  async function write(allowConflicts: boolean): Promise<Written> {
    if (isPrivate) {
      const result = await reschedulePrivateSession(workspaceId, item.id, {
        localDate: proposal.localDate,
        localStart: proposal.localStart,
        durationMinutes: proposal.durationMinutes,
        notify,
        version: item.version,
        ...(allowConflicts ? { allowConflicts } : {}),
      });
      if (result.ok) return { kind: 'moved' };
      if (result.reason === 'conflict') {
        return {
          kind: 'changed',
          by: result.changedBy ?? null,
          cancelled: result.code === 'session_cancelled',
        };
      }
      if (result.reason === 'fields') {
        const key = result.start ?? result.date;
        return key
          ? { kind: 'failed', failure: { text: 'sessions.form', key } }
          : { kind: 'failed', failure: 'notSaved' };
      }
      return refused(result);
    }
    const result = await editClassDate(workspaceId, item.id, {
      version: item.version,
      localStart: proposal.localStart,
      localEnd: proposal.localEnd,
      capacity: String(item.capacity),
      ...(item.series ? { scope } : {}),
      ...(allowConflicts ? { allowConflicts } : {}),
    });
    if (result.ok) return { kind: 'moved' };
    // The class date's refusal says who changed it first no more than that it did.
    if (result.reason === 'conflict') return { kind: 'changed', by: null, cancelled: false };
    if (result.reason === 'fields') {
      const key = result.scope ?? result.end ?? result.start ?? result.capacity;
      return typeof key === 'string'
        ? { kind: 'failed', failure: { text: 'classes.edit', key } }
        : { kind: 'failed', failure: 'notSaved' };
    }
    return refused(result);
  }

  async function save(allowConflicts: boolean) {
    setPending(true);
    setFailure(null);
    const written = await write(allowConflicts);
    setPending(false);
    setDoubleBooking(null);
    if (written.kind === 'moved') return outcome.moved(proposal.to);
    if (written.kind === 'home') return window.location.replace(SIGNED_IN_HOME);
    if (written.kind === 'changed') return outcome.changed(written.by, written.cancelled);
    if (written.kind === 'trainerConflict') {
      return setDoubleBooking({
        conflicts: written.conflicts,
        trainerName: ownSession || !item.trainer ? null : item.trainer.name,
      });
    }
    setFailure(written.failure);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!blocked) await save(false);
  }

  const startDate = place(proposal.to).split(' ').slice(0, -1).join(' ');
  const message =
    failure === null
      ? null
      : failure === 'noPermission'
        ? reschedule('noPermission')
        : failure === 'notSaved'
          ? formErrors('notSaved')
          : failure.text === 'sessions.form'
            ? formErrors(failure.key as 'invalidDate', { date: startDate })
            : editErrors(failure.key as 'invalidTime', { date: startDate });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        aria-describedby="move-description"
        className="gap-0 rounded-[14px] p-5.5 sm:max-w-md"
      >
        <form noValidate onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle className="text-lg leading-snug font-semibold">
              {t('moveTitle', { name })}
            </DialogTitle>
            <DialogDescription id="move-description" className="text-sm tabular-nums">
              {t('moveFromTo', { from: place(proposal.from), to: place(proposal.to) })}
            </DialogDescription>
          </DialogHeader>
          {!isPrivate && item.series ? (
            <fieldset className="grid gap-2">
              <legend className="mb-1 text-sm font-medium">{edit('scopeLabel')}</legend>
              {(['this', 'following'] as const).map((option) => (
                <label key={option} className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="scope"
                    value={option}
                    checked={scope === option}
                    onChange={() => setScope(option)}
                    className="size-4 accent-primary"
                  />
                  {option === 'this' ? edit('scopeThis') : edit('scopeFollowing')}
                </label>
              ))}
            </fieldset>
          ) : null}
          {isPrivate ? (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="notify"
                className="size-4 accent-primary"
                checked={notify}
                onChange={(event) => setNotify(event.target.checked)}
              />
              {reschedule('notify', { client: name })}
            </label>
          ) : null}
          {proposal.past && isPrivate ? (
            <p role="status" className="text-sm font-medium">
              {t('movePast')}
            </p>
          ) : null}
          {blocked ? <ErrorLine>{t('movePastBlocked')}</ErrorLine> : null}
          {message ? <ErrorLine>{message}</ErrorLine> : null}
          <DialogFooter className="mx-0 mb-0 border-0 bg-transparent p-0 pt-2">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                {t('moveBack')}
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending || blocked}>
              {t('moveConfirm')}
            </Button>
          </DialogFooter>
        </form>
        <DoubleBookingDialog
          doubleBooking={doubleBooking}
          timeZone={timeZone}
          pending={pending}
          onBack={() => setDoubleBooking(null)}
          onSaveAnyway={() => void save(true)}
        />
      </DialogContent>
    </Dialog>
  );
}
