'use client';

import { SIGNED_IN_HOME } from '@fivvi/auth/return-path';
import { GROUP_CLASS_LIMITS as LIMITS } from '@fivvi/domain/group-class-limits';
import { instantToWallClock } from '@fivvi/domain/zoned-time';
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
import { Field } from '@fivvi/ui/kit/field';
import { Toast } from '@fivvi/ui/kit/toast';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useState } from 'react';
import { type DoubleBooking, DoubleBookingDialog } from '../sessions/double-booking';
import { useSessionFormat } from '../sessions/use-session-format';
import { type EditDateResult, editClassDate, type Session } from './classes-client';

/** What the form shows of a date: its start, its end and its capacity as the person types them. */
function valuesOf(session: Session) {
  return {
    localStart: instantToWallClock(new Date(session.startsAt), session.timeZone).time,
    localEnd: instantToWallClock(new Date(session.endsAt), session.timeZone).time,
    capacity: String(session.capacity),
  };
}

/**
 * **Wijzigen** and the dialog of CO-04 (F021 AC4): the start, the end and the capacity of this one
 * date; the class itself and its other dates stay as they are. An end that is not after the start
 * says so under the end. A date someone else changed first is shown as it is now, with a line
 * about it, and saving again uses that version. After a save the page asks the server again.
 */
export function EditClassDate({
  workspaceId,
  session,
  ownDate,
}: {
  workspaceId: string;
  session: Session;
  /** The date's trainer is the signed-in person: PS-07 says "Je hebt dan al iets". */
  ownDate: boolean;
}) {
  const t = useTranslations('classes.edit');
  const date = useTranslations('classes.date');
  const e = useTranslations('classes.edit.errors');
  const router = useRouter();
  const { day, localDate } = useSessionFormat(session.timeZone);
  const [open, setOpen] = useState(false);
  const [version, setVersion] = useState(session.version);
  const [value, setValue] = useState(() => valuesOf(session));
  const [errors, setErrors] = useState<Extract<EditDateResult, { reason: 'fields' }> | null>(null);
  const [formError, setFormError] = useState<'noPermission' | 'notSaved' | null>(null);
  const [changed, setChanged] = useState(false);
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  // PS-07: the sessions the date's trainer already has at the new time; *Terug* keeps the form.
  const [doubleBooking, setDoubleBooking] = useState<DoubleBooking | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => setReady(true), []);
  useEffect(() => {
    if (!saved) return;
    const timer = setTimeout(() => setSaved(false), 8_000);
    return () => clearTimeout(timer);
  }, [saved]);

  function show(next: Session) {
    setVersion(next.version);
    setValue(valuesOf(next));
  }

  function change(next: boolean) {
    setOpen(next);
    if (next) {
      setDoubleBooking(null);
      show(session);
      setErrors(null);
      setFormError(null);
      setChanged(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await save(false);
  }

  /** Saves the date; `allowConflicts` is *Toch opslaan* of PS-07: the same change, on the same version. */
  async function save(allowConflicts: boolean) {
    setErrors(null);
    setFormError(null);
    setChanged(false);
    setPending(true);
    const result = await editClassDate(workspaceId, session.id, {
      version,
      ...value,
      ...(allowConflicts ? { allowConflicts } : {}),
    });
    setPending(false);
    setDoubleBooking(null);
    if (result.ok) {
      setOpen(false);
      setSaved(true);
      return router.refresh();
    }
    if (result.reason === 'home') return window.location.replace(SIGNED_IN_HOME);
    if (result.reason === 'trainerConflict') {
      return setDoubleBooking({
        conflicts: result.conflicts,
        trainerName: ownDate ? null : (session.trainer?.name ?? null),
      });
    }
    if (result.reason === 'fields') return setErrors(result);
    if (result.reason === 'conflict') {
      show(result.session);
      setChanged(true);
      return router.refresh();
    }
    setFormError(result.reason === 'forbidden' ? 'noPermission' : 'notSaved');
  }

  const dayOfStart = localDate(
    instantToWallClock(new Date(session.startsAt), session.timeZone).date,
  );
  const timeError = (key: 'timeDoesNotExist' | 'invalidTime' | 'endBeforeStart' | undefined) =>
    key === undefined
      ? undefined
      : key === 'timeDoesNotExist'
        ? e(key, { date: dayOfStart })
        : e(key);
  const startError = timeError(errors?.start);
  const endError = timeError(errors?.end);

  return (
    <>
      <Button type="button" variant="outline" disabled={!ready} onClick={() => change(true)}>
        {date('edit')}
      </Button>
      <Dialog open={open} onOpenChange={change}>
        {open ? (
          <DialogContent
            aria-describedby="edit-class-date-description"
            className="gap-0 rounded-[14px] p-5.5 sm:max-w-md"
          >
            <form noValidate onSubmit={submit} className="grid gap-4">
              <DialogHeader>
                <DialogTitle className="text-lg leading-snug font-semibold">
                  {t('title')}
                </DialogTitle>
                <DialogDescription id="edit-class-date-description">
                  {t('description', { date: day(session.startsAt) })}
                </DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-3">
                <Field
                  id="edit-class-date-start"
                  name="localStart"
                  type="time"
                  label={t('startLabel')}
                  value={value.localStart}
                  onChange={(event) => setValue({ ...value, localStart: event.target.value })}
                  error={startError}
                />
                <Field
                  id="edit-class-date-end"
                  name="localEnd"
                  type="time"
                  label={t('endLabel')}
                  value={value.localEnd}
                  onChange={(event) => setValue({ ...value, localEnd: event.target.value })}
                  error={endError}
                />
              </div>
              <Field
                id="edit-class-date-capacity"
                name="capacity"
                type="number"
                inputMode="numeric"
                label={t('capacityLabel')}
                value={value.capacity}
                onChange={(event) => setValue({ ...value, capacity: event.target.value })}
                error={
                  errors?.capacity
                    ? e('capacityInvalid', { min: LIMITS.capacity.min, max: LIMITS.capacity.max })
                    : undefined
                }
              />
              {changed ? <ErrorLine>{t('changed')}</ErrorLine> : null}
              {formError ? <ErrorLine>{e(formError)}</ErrorLine> : null}
              <DialogFooter className="mx-0 mb-0 border-0 bg-transparent p-0 pt-2">
                <DialogClose asChild>
                  <Button type="button" variant="outline">
                    {t('cancel')}
                  </Button>
                </DialogClose>
                <Button type="submit" disabled={pending}>
                  {t('save')}
                </Button>
              </DialogFooter>
            </form>
            <DoubleBookingDialog
              doubleBooking={doubleBooking}
              timeZone={session.timeZone}
              pending={pending}
              onBack={() => setDoubleBooking(null)}
              onSaveAnyway={() => void save(true)}
            />
          </DialogContent>
        ) : null}
      </Dialog>
      {saved ? <Toast>{t('saved')}</Toast> : null}
    </>
  );
}
