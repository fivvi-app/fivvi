'use client';

import { SIGNED_IN_HOME } from '@fivvi/auth/return-path';
import { GROUP_CLASS_LIMITS as LIMITS } from '@fivvi/domain/group-class-limits';
import type { TrainerWordForms } from '@fivvi/i18n';
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
import { Label } from '@fivvi/ui/components/label';
import { NativeSelect, NativeSelectOption } from '@fivvi/ui/components/native-select';
import { ErrorLine } from '@fivvi/ui/kit/error-line';
import { Field } from '@fivvi/ui/kit/field';
import { useRouter } from 'next/navigation';
import { useFormatter, useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useState } from 'react';
import { type DoubleBooking, DoubleBookingDialog } from '../sessions/double-booking';
import { useSessionFormat } from '../sessions/use-session-format';
import {
  type ClassSeries,
  type EditSeriesResult,
  editClassSeries,
  loadTrainers,
  type Trainer,
} from './classes-client';
import { FormSection } from './form-section';
import { referenceDay, seriesEnd } from './series';

type Trainers =
  | { status: 'loading' }
  | { status: 'failed' }
  | { status: 'ready'; trainers: Trainer[] };

/** What the form shows of a series: its start, its end, its capacity and its trainer as the person types them. */
function valuesOf(series: ClassSeries) {
  return {
    localStart: series.localStartTime,
    localEnd: seriesEnd(series.localStartTime, series.durationMinutes),
    capacity: String(series.capacity),
    trainerId: series.trainer?.id ?? '',
  };
}

/**
 * **Wijzigen** on a series of the class page's *Reeksen* card and the dialog *Reeks wijzigen*
 * (F022, CO-04; `DECISIONS.md`, *Trainer web → Lessen*): the trainer, the start, the end and the
 * capacity of every upcoming date. The API applies it from the first date that hasn't started, so
 * the web names no date; dates with their own changes keep them (`onSaved` gets how many). A
 * series someone else changed first is shown as it is now, with a line about it, and saving again
 * uses that version. PS-07 is *Toch opslaan*.
 */
export function EditSeries({
  workspaceId,
  teamMemberId,
  classId,
  series,
  trainerWord,
  onSaved,
}: {
  workspaceId: string;
  /** The signed-in person's own team-member ID: PS-07 says "Je hebt dan al iets" for their own overlap. */
  teamMemberId: string;
  classId: string;
  series: ClassSeries;
  trainerWord: TrainerWordForms;
  /** The change is saved: how many dates kept their own changes. */
  onSaved: (keptDates: number) => void;
}) {
  const t = useTranslations('classes.series');
  const d = useTranslations('classes.series.dialog');
  const e = useTranslations('classes.series.dialog.errors');
  const names = useTranslations('classes');
  const format = useFormatter();
  const router = useRouter();
  const { localDate } = useSessionFormat(series.timeZone);
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [loaded, setLoaded] = useState<Trainers>({ status: 'loading' });
  const [version, setVersion] = useState(series.version);
  const [value, setValue] = useState(() => valuesOf(series));
  const [errors, setErrors] = useState<Extract<EditSeriesResult, { reason: 'fields' }> | null>(
    null,
  );
  const [formError, setFormError] = useState<'noPermission' | 'notSaved' | null>(null);
  const [changed, setChanged] = useState(false);
  const [pending, setPending] = useState(false);
  // PS-07: the sessions the trainer already has at the new time; *Terug* keeps the form.
  const [doubleBooking, setDoubleBooking] = useState<DoubleBooking | null>(null);

  useEffect(() => setReady(true), []);
  useEffect(() => {
    if (!open) return;
    let current = true;
    setLoaded({ status: 'loading' });
    void loadTrainers(workspaceId).then((result) => {
      if (!current) return;
      if (!result.ok) {
        if (result.reason === 'home') return window.location.replace(SIGNED_IN_HOME);
        return setLoaded({ status: 'failed' });
      }
      setLoaded({ status: 'ready', trainers: result.trainers });
    });
    return () => {
      current = false;
    };
  }, [open, workspaceId]);

  function show(next: ClassSeries) {
    setVersion(next.version);
    setValue(valuesOf(next));
  }

  function change(next: boolean) {
    setOpen(next);
    if (next) {
      setDoubleBooking(null);
      show(series);
      setErrors(null);
      setFormError(null);
      setChanged(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await save(false);
  }

  /** Saves the series; `allowConflicts` is *Toch opslaan* of PS-07: the same change, on the same version. */
  async function save(allowConflicts: boolean) {
    setErrors(null);
    setFormError(null);
    setChanged(false);
    setPending(true);
    const result = await editClassSeries(workspaceId, classId, series.id, {
      version,
      ...value,
      ...(allowConflicts ? { allowConflicts } : {}),
    });
    setPending(false);
    setDoubleBooking(null);
    if (result.ok) {
      setOpen(false);
      onSaved(result.keptDates);
      return router.refresh();
    }
    if (result.reason === 'home') return window.location.replace(SIGNED_IN_HOME);
    if (result.reason === 'trainerConflict') {
      return setDoubleBooking({
        conflicts: result.conflicts,
        trainerName:
          value.trainerId === teamMemberId
            ? null
            : loaded.status === 'ready'
              ? (loaded.trainers.find(({ id }) => id === value.trainerId)?.name ?? null)
              : null,
      });
    }
    if (result.reason === 'fields') return setErrors(result);
    if (result.reason === 'conflict') {
      show(result.series);
      setChanged(true);
      return router.refresh();
    }
    setFormError(result.reason === 'forbidden' ? 'noPermission' : 'notSaved');
  }

  const weekday = format.dateTime(referenceDay(series.weekday), {
    timeZone: 'UTC',
    weekday: 'long',
  });
  const rangeError = (key: 'endBeforeStart' | 'invalidDuration' | 'invalidTime' | undefined) =>
    key === undefined
      ? undefined
      : key === 'invalidDuration'
        ? e(key, {
            min: LIMITS.duration.min,
            max: LIMITS.duration.max,
            step: LIMITS.duration.step,
          })
        : e(key);
  // The date a skipped start belongs to: the first one the clocks skip.
  const startError = errors?.start
    ? errors.start === 'timeDoesNotExist'
      ? e('timeDoesNotExist', { date: errors.startDate ? localDate(errors.startDate) : '' })
      : e(errors.start)
    : undefined;

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={!ready}
        aria-label={t('editLabel', { weekday, start: series.localStartTime })}
        onClick={() => change(true)}
      >
        {t('edit')}
      </Button>
      <Dialog open={open} onOpenChange={change}>
        {open ? (
          <DialogContent
            aria-describedby="edit-series-description"
            className="max-h-[calc(100dvh-2rem)] grid-rows-[auto_1fr_auto] gap-0 overflow-hidden rounded-[14px] p-0 sm:max-w-md"
          >
            <form noValidate onSubmit={submit} className="contents">
              <DialogHeader className="px-5.5 pt-5.5 pb-4">
                <DialogTitle className="text-lg leading-snug font-semibold">
                  {d('title')}
                </DialogTitle>
                <DialogDescription id="edit-series-description">
                  {d('description')}
                </DialogDescription>
              </DialogHeader>
              <div className="grid content-start gap-4 overflow-y-auto px-5.5 pb-4">
                {loaded.status === 'failed' ? (
                  <ErrorLine>{d('loadFailed')}</ErrorLine>
                ) : (
                  <FormSection title={d('section')} first>
                    <div className="grid gap-1.5">
                      <Label htmlFor="edit-series-trainer">
                        {d('trainerLabel', { ...trainerWord })}
                      </Label>
                      <NativeSelect
                        id="edit-series-trainer"
                        name="trainerId"
                        value={value.trainerId}
                        className="w-full"
                        onChange={(event) => setValue({ ...value, trainerId: event.target.value })}
                      >
                        <NativeSelectOption value="">
                          {names('trainerNeeded', { ...trainerWord })}
                        </NativeSelectOption>
                        {loaded.status === 'ready'
                          ? loaded.trainers.map((trainer) => (
                              <NativeSelectOption key={trainer.id} value={trainer.id}>
                                {trainer.name}
                              </NativeSelectOption>
                            ))
                          : series.trainer && (
                              <NativeSelectOption value={series.trainer.id}>
                                {series.trainer.name}
                              </NativeSelectOption>
                            )}
                      </NativeSelect>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <Field
                        id="edit-series-start"
                        name="localStart"
                        type="time"
                        label={d('startLabel')}
                        value={value.localStart}
                        onChange={(event) => setValue({ ...value, localStart: event.target.value })}
                        error={startError}
                      />
                      <Field
                        id="edit-series-end"
                        name="localEnd"
                        type="time"
                        label={d('endLabel')}
                        value={value.localEnd}
                        onChange={(event) => setValue({ ...value, localEnd: event.target.value })}
                        error={rangeError(errors?.end)}
                      />
                    </div>
                    <Field
                      id="edit-series-capacity"
                      name="capacity"
                      type="number"
                      inputMode="numeric"
                      label={d('capacityLabel')}
                      value={value.capacity}
                      onChange={(event) => setValue({ ...value, capacity: event.target.value })}
                      error={
                        errors?.capacity
                          ? e('capacityInvalid', {
                              min: LIMITS.capacity.min,
                              max: LIMITS.capacity.max,
                            })
                          : undefined
                      }
                    />
                  </FormSection>
                )}
                {errors?.noUpcomingDates ? <ErrorLine>{e('noUpcomingDates')}</ErrorLine> : null}
                {changed ? <ErrorLine>{d('changed')}</ErrorLine> : null}
                {formError ? <ErrorLine>{e(formError)}</ErrorLine> : null}
              </div>
              <DialogFooter className="mx-0 mb-0 rounded-none">
                <DialogClose asChild>
                  <Button type="button" variant="outline">
                    {d('cancel')}
                  </Button>
                </DialogClose>
                <Button type="submit" disabled={pending || loaded.status === 'failed'}>
                  {d('save')}
                </Button>
              </DialogFooter>
            </form>
            <DoubleBookingDialog
              doubleBooking={doubleBooking}
              timeZone={series.timeZone}
              pending={pending}
              onBack={() => setDoubleBooking(null)}
              onSaveAnyway={() => void save(true)}
            />
          </DialogContent>
        ) : null}
      </Dialog>
    </>
  );
}
