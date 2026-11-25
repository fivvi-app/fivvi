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
import { ClassLevelSelect } from './class-level';
import {
  type ClassLevelChoice,
  type EditDateResult,
  editClassDate,
  loadKeptDates,
  type Session,
} from './classes-client';

/** What the form shows of a date: its start, its end and its capacity as the person types them. */
function valuesOf(session: Session) {
  return {
    localStart: instantToWallClock(new Date(session.startsAt), session.timeZone).time,
    localEnd: instantToWallClock(new Date(session.endsAt), session.timeZone).time,
    capacity: String(session.capacity),
    level: (session.level ?? '') as ClassLevelChoice,
  };
}

/**
 * **Wijzigen** and the dialog of CO-04 (F021 AC4): the start, the end, the capacity and the level
 * (*Niveau*, F067) of this one date; the class itself and its other dates stay as they are. An end that is not after the start
 * says so under the end. A date someone else changed first is shown as it is now, with a line
 * about it, and saving again uses that version. After a save the page asks the server again.
 */
export function EditClassDate({
  workspaceId,
  session,
  ownDate,
  startOpen = false,
}: {
  workspaceId: string;
  session: Session;
  /** The date's trainer is the signed-in person: PS-07 says "Je hebt dan al iets". */
  ownDate: boolean;
  /** The dialog is open from the start (`?edit=1`). */
  startOpen?: boolean;
}) {
  const t = useTranslations('classes.edit');
  const date = useTranslations('classes.date');
  const e = useTranslations('classes.edit.errors');
  const router = useRouter();
  const { day, localDate } = useSessionFormat(session.timeZone);
  const [open, setOpen] = useState(startOpen);
  const [version, setVersion] = useState(session.version);
  const [value, setValue] = useState(() => valuesOf(session));
  // The level the date has as the person saw it (F067): it is sent only when they changed it, so a
  // change of the times for the following dates does not overwrite their levels.
  const [shownLevel, setShownLevel] = useState<ClassLevelChoice>(() => valuesOf(session).level);
  const [errors, setErrors] = useState<Extract<EditDateResult, { reason: 'fields' }> | null>(null);
  const [formError, setFormError] = useState<'noPermission' | 'notSaved' | null>(null);
  const [changed, setChanged] = useState(false);
  const [pending, setPending] = useState(false);
  // *Wijzigen voor* (F022): only for a date of a series.
  const [scope, setScope] = useState<'this' | 'following'>('this');
  // CO-04, before saving: how many dates from this one on keep their own changes; `null` until read.
  const [kept, setKept] = useState<number | null>(null);
  // After a save: how many dates kept their own changes, when the series was changed.
  const [saved, setSaved] = useState<{ keptDates: number } | null>(null);
  // PS-07: the sessions the date's trainer already has at the new time; *Terug* keeps the form.
  const [doubleBooking, setDoubleBooking] = useState<DoubleBooking | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => setReady(true), []);
  useEffect(() => {
    if (!saved) return;
    const timer = setTimeout(() => setSaved(null), 8_000);
    return () => clearTimeout(timer);
  }, [saved]);

  // *Deze en volgende lessen*: the API counts the dates that keep their own changes; the screen
  // only says it. Read each time the choice is made, so it is the count of now.
  useEffect(() => {
    if (!open || scope !== 'following') {
      setKept(null);
      return;
    }
    let current = true;
    void loadKeptDates(workspaceId, session.id).then((result) => {
      if (current) setKept(result.ok ? result.keptDates : null);
    });
    return () => {
      current = false;
    };
  }, [open, scope, workspaceId, session.id]);

  function show(next: Session) {
    setVersion(next.version);
    setValue(valuesOf(next));
    setShownLevel(valuesOf(next).level);
  }

  function change(next: boolean) {
    setOpen(next);
    if (next) {
      setDoubleBooking(null);
      show(session);
      setErrors(null);
      setFormError(null);
      setChanged(false);
      setScope('this');
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
    const { level, ...times } = value;
    const result = await editClassDate(workspaceId, session.id, {
      version,
      ...times,
      ...(level === shownLevel ? {} : { level }),
      scope,
      ...(allowConflicts ? { allowConflicts } : {}),
    });
    setPending(false);
    setDoubleBooking(null);
    if (result.ok) {
      setOpen(false);
      setSaved({ keptDates: result.keptDates ?? 0 });
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
  const timeError = (
    key: 'timeDoesNotExist' | 'invalidTime' | 'endBeforeStart' | 'invalidDuration' | undefined,
  ) =>
    key === undefined
      ? undefined
      : key === 'timeDoesNotExist'
        ? e(key, { date: dayOfStart })
        : key === 'invalidDuration'
          ? e(key, {
              min: LIMITS.duration.min,
              max: LIMITS.duration.max,
              step: LIMITS.duration.step,
            })
          : e(key);
  const startError =
    errors?.start === 'timeDoesNotExist' && errors.startDate
      ? e('timeDoesNotExist', { date: localDate(errors.startDate) })
      : timeError(errors?.start);
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
                  {scope === 'following'
                    ? t('descriptionFollowing', { date: day(session.startsAt) })
                    : t('description', { date: day(session.startsAt) })}
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
              <ClassLevelSelect
                id="edit-class-date-level"
                value={value.level}
                onChange={(level) => setValue({ ...value, level })}
              />
              {session.series ? (
                <fieldset className="grid gap-2">
                  <legend className="mb-1 text-sm font-medium">{t('scopeLabel')}</legend>
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
                      {option === 'this' ? t('scopeThis') : t('scopeFollowing')}
                    </label>
                  ))}
                  {/* CO-04: said before Opslaan; nothing when no date keeps its own changes. */}
                  <div role="status" className="text-sm text-muted-foreground">
                    {kept !== null && kept > 0 ? <p>{t('kept', { count: kept })}</p> : null}
                  </div>
                  {errors?.scope ? <ErrorLine>{e(errors.scope)}</ErrorLine> : null}
                </fieldset>
              ) : null}
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
      {saved ? (
        <Toast>
          <div>
            <p>{t('saved')}</p>
            {saved.keptDates > 0 ? <p>{t('kept', { count: saved.keptDates })}</p> : null}
          </div>
        </Toast>
      ) : null}
    </>
  );
}
